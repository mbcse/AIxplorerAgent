// app/api/analyze/route.ts
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { ethers } from 'ethers';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { systemPrompt } from './systemPrompt';
import { ERC20_ABI } from './ABI/erc20';
import { ERC721_ABI } from './ABI/erc721';
import { ERC1155_ABI } from './ABI/erc1155';


function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInts(item));
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInts(value);
    }
    return serialized;
  }

  return obj;
}

interface Chain {
  name: string;
  chainId: number;
  shortName?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpc: string[];
}

// Chain data management
class ChainManager {
  private static instance: ChainManager;
  private chains: Chain[] = [];
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  private readonly CHAINLIST_URL = 'https://chainid.network/chains.json';
  private readonly CUSTOM_CHAINS: Chain[] = [
    {
      name: 'Polygon zkEVM',
      chainId: 1101,
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18
      },
      rpc: [
        'https://zkevm-rpc.com',
        'https://rpc.polygon-zkevm.gateway.fm'
      ]
    },
    {
      name: 'Base',
      chainId: 8453,
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18
      },
      rpc: [
        'https://mainnet.base.org',
        'https://base.gateway.tenderly.co',
        'https://base.publicnode.com'
      ]
    }
  ];

  private constructor() {}

  static getInstance(): ChainManager {
    if (!ChainManager.instance) {
      ChainManager.instance = new ChainManager();
    }
    return ChainManager.instance;
  }

  private async fetchChains() {
    console.log('Fetching chains...');
    try {
      const response = await fetch(this.CHAINLIST_URL);
      if (!response.ok) throw new Error('Failed to fetch chain data');
      this.chains = await response.json();
      
      // Add custom chains
      this.chains = [...this.chains, ...this.CUSTOM_CHAINS];
      
      // Filter out chains without RPC endpoints
      this.chains = this.chains.filter(chain => chain.rpc && chain.rpc.length > 0);
      
      // Clean RPC URLs
      this.chains = this.chains.map(chain => ({
        ...chain,
        rpc: chain.rpc.filter(url => 
          !url.includes('${INFURA_API_KEY}') &&
          !url.includes('${ALCHEMY_API_KEY}') &&
          !url.includes('INFURA_API_KEY') &&
          !url.includes('ALCHEMY_API_KEY') &&
          !url.includes('API_KEY') &&
          !url.includes('api-key') &&
          !url.includes('https://cloudflare-eth.com') &&
          !url.includes('https://ethereum-rpc.publicnode.com')
        )
      }));

      this.lastFetch = Date.now();
      console.log(`Fetched ${this.chains.length} chains`);
    } catch (error) {
      console.error('Error fetching chains:', error);
      throw error;
    }
  }

  async getChain(chainId: number): Promise<Chain | undefined> {
    if (this.chains.length === 0 || Date.now() - this.lastFetch > this.CACHE_DURATION) {
      await this.fetchChains();
    }
    return this.chains.find(chain => chain.chainId === chainId);
  }

  async getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
    const chain = await this.getChain(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);
    if (!chain.rpc || chain.rpc.length === 0) throw new Error(`No RPC endpoints found for chain ${chainId}`);

    const errors: Error[] = [];
    for (const rpc of chain.rpc) {
      try {
        console.log(`Trying RPC: ${rpc}`);
        const provider = new ethers.JsonRpcProvider(rpc);
        // Test the connection
        await provider.getBlockNumber();
        console.log(`Successfully connected to RPC: ${rpc}`);
        return provider;
      } catch (error) {
        console.warn(`RPC ${rpc} failed:`, error);
        errors.push(error as Error);
        continue;
      }
    }
    throw new Error(`All RPCs failed for chain ${chainId}. Errors: ${errors.map(e => e.message).join(', ')}`);
  }
}

// Token metadata fetching with caching
class TokenMetadataCache {
  private static instance: TokenMetadataCache;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour

  private constructor() {}

  static getInstance(): TokenMetadataCache {
    if (!TokenMetadataCache.instance) {
      TokenMetadataCache.instance = new TokenMetadataCache();
    }
    return TokenMetadataCache.instance;
  }

  async getTokenMetadata(provider: ethers.JsonRpcProvider, tokenAddress: string, tokenType: string = 'ERC20') {
    const cacheKey = `${tokenAddress}-${tokenType}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      let contract;
      let metadata: any = { 
        address: tokenAddress,
        type: tokenType,
        timestamp: Date.now()
      };

      switch (tokenType) {
        case 'ERC20':
          contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          try {
            const [name, symbol, decimals] = await Promise.all([
              contract.name(),
              contract.symbol(),
              contract.decimals()
            ]);
            metadata = {
              ...metadata,
              name,
              symbol,
              decimals
            };
          } catch (e) {
            console.warn('Error fetching ERC20 metadata:', e);
            metadata.error = 'Incomplete metadata';
          }
          break;

        case 'ERC721':
          contract = new ethers.Contract(tokenAddress, ERC721_ABI, provider);
          try {
            const [name, symbol] = await Promise.all([
              contract.name(),
              contract.symbol()
            ]);
            metadata = {
              ...metadata,
              name,
              symbol
            };
          } catch (e) {
            console.warn('Error fetching ERC721 metadata:', e);
            metadata.error = 'Incomplete metadata';
          }
          break;

        case 'ERC1155':
          contract = new ethers.Contract(tokenAddress, ERC1155_ABI, provider);
          metadata = {
            ...metadata,
            type: 'ERC1155'
          };
          break;
      }

      this.cache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      return metadata;
    } catch (error) {
      console.error('Error getting token metadata:', error);
      return { 
        address: tokenAddress, 
        type: tokenType,
        error: 'Failed to fetch metadata'
      };
    }
  }
}

// Transaction analysis
async function analyzeTransaction(txHash: string, chainId: number) {
  console.log(`Analyzing transaction: ${txHash} on chainId: ${chainId}`);
  const chainManager = ChainManager.getInstance();
  const metadataCache = TokenMetadataCache.getInstance();

  try {
    const provider = await chainManager.getProvider(chainId);
    const chain = await chainManager.getChain(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    const tx = await provider.getTransaction(txHash);
    if (!tx) throw new Error('Transaction not found');

    const receipt = await provider.getTransactionReceipt(txHash);
    const block = await provider.getBlock(tx.blockNumber!);

    interface Transfer {
      tokenType: string;
      token: any;
      from: string;
      to: string;
      value?: string;
      tokenId?: string;
      tokenIds?: string[];
      amounts?: string[];
    }

    const analysis = {
      network: {
        name: chain.name,
        chainId: chain.chainId,
        currency: chain.nativeCurrency.symbol,
        blockNumber: tx.blockNumber,
        blockTimestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : 'unknown'
      },
      transaction: {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        nonce: tx.nonce,
        status: receipt?.status ? 'Success' : 'Failed',
        gasUsed: receipt?.gasUsed?.toString(),
        gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : 'unknown',
        maxFeePerGas: tx.maxFeePerGas ? ethers.formatUnits(tx.maxFeePerGas, 'gwei') : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? ethers.formatUnits(tx.maxPriorityFeePerGas, 'gwei') : undefined,
        totalCost: receipt?.gasUsed && tx.gasPrice ? 
          ethers.formatEther(receipt.gasUsed * tx.gasPrice) : 'unknown'
      },
      type: 'Unknown',
      transfers: [] as Transfer[],
      interactions: [] as string[],
      events: [] as any[],
      otherEvents: [] as any[]
    };

    // Native transfer check
    if (tx.value > 0n) {
      analysis.type = 'Native Transfer';
      analysis.transfers.push({
        tokenType: 'Native',
        token: {
          symbol: chain.nativeCurrency.symbol,
          decimals: chain.nativeCurrency.decimals
        },
        from: tx.from,
        to: tx.to || 'Contract Creation',
        value: ethers.formatEther(tx.value)
      });
    }

    // Event signatures
    const transferEvent = ethers.id('Transfer(address,address,uint256)');
    const transferSingleEvent = ethers.id('TransferSingle(address,address,address,uint256,uint256)');
    const transferBatchEvent = ethers.id('TransferBatch(address,address,address,uint256[],uint256[])');
    const swapEvent = ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');

    // Process transaction logs
    for (const log of receipt?.logs || []) {
      // Track unique contracts interacted with
      if (!analysis.interactions.includes(log.address)) {
        analysis.interactions.push(log.address);
      }

      // ERC20 Transfer
      if (log.topics[0] === transferEvent && log.topics.length === 3) {
        const tokenMetadata = await metadataCache.getTokenMetadata(provider, log.address, 'ERC20');
        analysis.transfers.push({
          tokenType: 'ERC20',
          token: tokenMetadata,
          from: '0x' + log.topics[1].slice(26),
          to: '0x' + log.topics[2].slice(26),
          value: ethers.formatUnits(log.data, tokenMetadata.decimals || 18)
        });
        analysis.type = analysis.type === 'Unknown' ? 'Token Transfer' : 
                       analysis.type === 'Native Transfer' ? 'Native + Token Transfer' : 
                       analysis.type;
      }
      // ERC721 Transfer
      else if (log.topics[0] === transferEvent && log.topics.length === 4) {
        const tokenMetadata = await metadataCache.getTokenMetadata(provider, log.address, 'ERC721');
        analysis.transfers.push({
          tokenType: 'ERC721',
          token: tokenMetadata,
          from: '0x' + log.topics[1].slice(26),
          to: '0x' + log.topics[2].slice(26),
          tokenId: log.topics[3]
        });
        analysis.type = analysis.type === 'Unknown' ? 'NFT Transfer' :
                       analysis.type.includes('Transfer') ? analysis.type + ' + NFT' :
                       analysis.type;
      }
      // ERC1155 Batch Transfer
      else if (log.topics[0] === transferBatchEvent) {
        const tokenMetadata = await metadataCache.getTokenMetadata(provider, log.address, 'ERC1155');
        const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
          ['uint256[]', 'uint256[]'],
          log.data
        );
        analysis.transfers.push({
          tokenType: 'ERC1155',
          token: tokenMetadata,
          from: '0x' + log.topics[2].slice(26),
          to: '0x' + log.topics[3].slice(26),
          tokenIds: decodedData[0].map(id => id.toString()),
          amounts: decodedData[1].map(amount => amount.toString())
        });
        analysis.type = analysis.type === 'Unknown' ? 'NFT Transfer' :
                       analysis.type.includes('Transfer') ? analysis.type + ' + NFT' :
                       analysis.type;
      }
      // DEX Swap
      // else if (log.topics[0] === swapEvent) {
      //   analysis.type = analysis.type === 'Unknown' ? 'DEX Swap' :
      //                  analysis.type.includes('Transfer') ? analysis.type + ' + Swap' :
      //                  analysis.type;
                       
      //   const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
      //     ['uint256', 'uint256', 'uint256', 'uint256', 'address'],
      //     log.data
      //   );
        
      //   analysis.events.push({
      //     type: 'Swap',
      //     address: log.address,
      //     data: {
      //       amount0In: decodedData[0].toString(),
      //       amount1In: decodedData[1].toString(),
      //       amount0Out: decodedData[2].toString(),
      //       amount1Out: decodedData[3].toString(),
      //       recipient: decodedData[4]
      //     }
      //   });
      // }
      else {
        analysis.otherEvents.push({
          address: log.address,
          topics: log.topics,
          data: log.data
        });
      }
    }

    // Contract deployment check
    if (!tx.to) {
      analysis.type = analysis.type === 'Unknown' ? 'Contract Deployment' :
                     analysis.type + ' + Contract Deployment';
    }
    // Contract interaction check
    else if (tx.data !== '0x' && analysis.type === 'Unknown') {
      analysis.type = 'Contract Interaction';
      
      // Try to decode function signature
      const functionSelector = tx.data.slice(0, 10);
      analysis.transaction.functionSelector = functionSelector;
    }

    // Calculate average gas price for the chain
    try {
      const latestBlock = await provider.getBlock('latest');
      const blockNumber = latestBlock?.number || 0;
      const lastFewBlocks = await Promise.all(
        Array.from({length: 5}, (_, i) => provider.getBlock(blockNumber - i))
      );
      
      const avgGasPrice = lastFewBlocks.reduce((sum, block) => {
        return sum + (block?.baseFeePerGas || 0n);
      }, 0n) / BigInt(lastFewBlocks.length);
      
      analysis.network.averageGasPrice = ethers.formatUnits(avgGasPrice, 'gwei');
    } catch (error) {
      console.warn('Error getting average gas price:', error);
    }

    // Add contract verification status for interactions
    try {
      for (const address of analysis.interactions) {
        try {
          const code = await provider.getCode(address);
          if (code === '0x') {
            analysis.events.push({
              type: 'Warning',
              message: `Address ${address} is not a contract`
            });
          }
        } catch (error) {
          console.warn(`Error checking contract at ${address}:`, error);
        }
      }
    } catch (error) {
      console.warn('Error checking contract verification:', error);
    }

    // Add complexity and risk analysis
    analysis.summary = {
      totalTransfers: analysis.transfers.length,
      uniqueTokens: new Set(analysis.transfers.map(t => t.token.address)).size,
      uniqueContracts: analysis.interactions.length,
      complexityScore: calculateComplexityScore(analysis),
      riskLevel: calculateRiskLevel(analysis),
    };

    return analysis;
  } catch (error) {
    console.error('Transaction analysis error:', error);
    throw error;
  }
}

// Helper function to calculate transaction complexity
function calculateComplexityScore(analysis: any): string {
  let score = 0;
  
  // Add points for different aspects of the transaction
  score += analysis.transfers.length * 2;
  score += analysis.interactions.length * 3;
  score += analysis.events.length * 2;
  score += analysis.type.includes('+') ? 5 : 0;
  
  // Convert score to category
  if (score <= 5) return 'Simple';
  if (score <= 15) return 'Moderate';
  if (score <= 30) return 'Complex';
  return 'Very Complex';
}

// Helper function to assess transaction risk level
function calculateRiskLevel(analysis: any): string {
  let riskFactors = 0;
  
  // Check various risk factors
  if (analysis.interactions.length > 3) riskFactors++;
  if (analysis.type.includes('Swap')) riskFactors++;
  if (analysis.events.some(e => e.type === 'Warning')) riskFactors += 2;
  if (analysis.transfers.length > 5) riskFactors++;
  if (analysis.type.includes('Contract Deployment')) riskFactors++;
  
  // Convert risk factors to level
  if (riskFactors === 0) return 'Low';
  if (riskFactors <= 2) return 'Medium';
  return 'High';
}

// Create OpenAI instance
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? ''
});

// API Route handler
export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ],
      tools: {
        analyzeTx: tool({
          description: 'Analyze a blockchain transaction with detailed token and NFT parsing',
          parameters: z.object({
            txHash: z.string().describe('The transaction hash to analyze'),
            chainId: z.number().describe('The chain ID where the transaction occurred'),
          }),
          execute: async ({ txHash, chainId }) => {
            try {
              const analysis = await analyzeTransaction(txHash, chainId);
              const serializedAnalysis = serializeBigInts(analysis);
              return {
                success: true,
                data: JSON.stringify(serializedAnalysis),
              };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
              };
            }
          },
        }),
      },
      temperature: 0.7,
      maxSteps: 5,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const runtime = 'edge';
export const maxDuration = 15;;