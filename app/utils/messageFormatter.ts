// utils/messageFormatter.ts
import { extractComplexityBadge, extractRiskBadge } from './formatUtils';

export const formatList = (content: string): string => {
  if (!content) return '';
  return content.split('\n')
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(item => {
      const formattedItem = item.replace(/^-\s*/, '');
      if (formattedItem.toLowerCase().includes('warning')) {
        return `<div class="bg-red-50 text-red-700 p-4 rounded-xl my-2 border-l-4 border-red-500 hover:shadow-lg transition-all duration-300">${formattedItem}</div>`;
      }
      if (formattedItem.toLowerCase().includes('success')) {
        return `<div class="bg-green-50 text-green-700 p-4 rounded-xl my-2 border-l-4 border-green-500 hover:shadow-lg transition-all duration-300">${formattedItem}</div>`;
      }
      return `<div class="text-gray-700 p-3 rounded-xl my-2 hover:bg-gray-50 transition-all duration-300">${formattedItem}</div>`;
    })
    .join('');
};

export const formatTransferSection = (content: string): string => {
  if (!content) return '<div class="text-gray-500 text-center italic p-4">No transfers detected</div>';
  
  const parts = content.split('---Sub Section---');
  let html = '';
  
  parts.forEach(part => {
    if (part.includes('Native Currency:')) {
      html += `<div class="bg-gradient-to-r from-blue-50 to-blue-100/50 backdrop-blur-sm border-l-4 border-blue-500 p-4 mb-4 rounded-xl hover:shadow-lg transition-all duration-300">
        <h4 class="flex items-center text-base font-medium text-gray-900 mb-3">
          <span class="mr-2">💰</span>
          <span>Native Currency Transfer</span>
        </h4>
        ${formatList(part.replace('Native Currency:', '').trim())}
      </div>`;
    }
    else if (part.includes('Token Transfers (ERC20):')) {
      html += `<div class="bg-gradient-to-r from-green-50 to-green-100/50 backdrop-blur-sm border-l-4 border-green-500 p-4 mb-4 rounded-xl hover:shadow-lg transition-all duration-300">
        <h4 class="flex items-center text-base font-medium text-gray-900 mb-3">
          <span class="mr-2">🪙</span>
          <span>Token Transfers</span>
        </h4>
        ${formatList(part.replace('Token Transfers (ERC20):', '').trim())}
      </div>`;
    }
    else if (part.includes('NFT Transfers')) {
      html += `<div class="bg-gradient-to-r from-pink-50 to-pink-100/50 backdrop-blur-sm border-l-4 border-pink-500 p-4 mb-4 rounded-xl hover:shadow-lg transition-all duration-300">
        <h4 class="flex items-center text-base font-medium text-gray-900 mb-3">
          <span class="mr-2">🖼️</span>
          <span>NFT Transfers</span>
        </h4>
        ${formatList(part.replace('NFT Transfers (ERC721/ERC1155):', '').trim())}
      </div>`;
    }
  });
  
  return html || '<div class="text-gray-500 text-center italic p-4">No transfers detected</div>';
};

export const formatAssistantMessage = (content: string): string => {
  if (!content) return '';
  
  const sections = content.split('---Section---');
  let formattedContent = '';
  
  sections.forEach(section => {
    if (section.includes('TRANSACTION OVERVIEW:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-indigo-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-indigo-100 p-2 rounded-xl">🔍</span>
          <span>Transaction Overview</span>
          ${extractComplexityBadge(section)}
        </h3>
        ${formatList(section.replace('TRANSACTION OVERVIEW:', '').trim())}
      </div>`;
    }
    else if (section.includes('NETWORK DETAILS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-blue-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-blue-100 p-2 rounded-xl">🌐</span>
          <span>Network Details</span>
        </h3>
        ${formatList(section.replace('NETWORK DETAILS:', '').trim())}
      </div>`;
    }
    else if (section.includes('TRANSFER ANALYSIS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-purple-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-purple-100 p-2 rounded-xl">↔️</span>
          <span>Transfer Analysis</span>
        </h3>
        ${formatTransferSection(section.replace('TRANSFER ANALYSIS:', '').trim())}
      </div>`;
    }
    else if (section.includes('DEX INTERACTIONS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-orange-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-orange-100 p-2 rounded-xl">🔄</span>
          <span>DEX Interactions</span>
        </h3>
        ${formatList(section.replace('DEX INTERACTIONS:', '').trim())}
      </div>`;
    }
    else if (section.includes('CONTRACT INTERACTIONS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-yellow-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-yellow-100 p-2 rounded-xl">📝</span>
          <span>Contract Interactions</span>
        </h3>
        ${formatList(section.replace('CONTRACT INTERACTIONS:', '').trim())}
      </div>`;
    }
    else if (section.includes('COST ANALYSIS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-green-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-green-100 p-2 rounded-xl">⛽</span>
          <span>Cost Analysis</span>
        </h3>
        ${formatList(section.replace('COST ANALYSIS:', '').trim())}
      </div>`;
    }
    else if (section.includes('SECURITY ASSESSMENT:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-red-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-red-100 p-2 rounded-xl">🛡️</span>
          <span>Security Assessment</span>
          ${extractRiskBadge(section)}
        </h3>
        ${formatList(section.replace('SECURITY ASSESSMENT:', '').trim())}
      </div>`;
    }
    else if (section.includes('ADDITIONAL INSIGHTS:')) {
      formattedContent += `<div class="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl p-6 mb-4 hover:shadow-xl transition-all duration-300">
        <h3 class="flex items-center text-lg font-semibold text-gray-900 mb-4">
          <span class="mr-3 bg-gray-100 p-2 rounded-xl">💡</span>
          <span>Additional Insights</span>
        </h3>
        ${formatList(section.replace('ADDITIONAL INSIGHTS:', '').trim())}
      </div>`;
    }
     // Check for Mermaid diagram (e.g., "graph TD;")
     else if (section.includes('graph TD;') || section.includes('graph LR;') || section.includes('sequenceDiagram')) {
      formattedContent += `<div class="mermaid">${section}</div>`;
    }
  });
  
  return formattedContent || `<div class="text-gray-700 whitespace-pre-wrap">${content}</div>`;
};