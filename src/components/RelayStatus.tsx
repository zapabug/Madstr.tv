import React from 'react';

interface RelayStatusProps {
  isReceivingData: boolean; // Simplified prop
  relayCount: number; // <<< Re-add relayCount prop
  onSettingsClick: () => void; // Add the callback prop
}

const RelayStatus: React.FC<RelayStatusProps> = ({ isReceivingData, relayCount, onSettingsClick }) => {

  // <<< REMOVE unused getTextColor function >>>
  /*
  const getTextColor = (): string => {
      if (!isReceivingData) {
          return 'text-yellow-500'; // Connecting or not receiving
      }
      if (relayCount < 3) {
          return 'text-orange-400'; // Receiving, but few relays
      }
      return 'text-green-400 font-semibold'; // Receiving data, 3+ relays: Green, slightly bolder
  };
  */

  // Determine status text and color based on the prop (keep for potential future use or title)
  // const statusText = isReceivingData ? 'Connected' : 'Connecting...';
  // const statusColor = isReceivingData ? 'bg-green-500' : 'bg-yellow-500';

  return (
    // Use relative positioning on the container to position the button absolutely
    <div className="group relative w-fit h-fit"> {/* Fit content size */} 
      {/* Relay Count Span (The base layer) */}
      <span 
        className={`text-xs font-medium text-gray-400`} 
        title={isReceivingData ? `Connected (${relayCount} relays)` : 'Connecting...'}
      >
         {relayCount} 
      </span>

      {/* Settings Button (Absolute position, covers the number, centered icon) */}
      <button 
        aria-label="Settings"
        tabIndex={0} 
        className="absolute inset-0 flex items-center justify-center p-0.5 rounded text-purple-500 
                   focus:opacity-100 group-focus-within:opacity-100 
                   transition-opacity duration-150 
                   focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
        onClick={onSettingsClick}
      >
          {/* Simple Gear SVG (centered by button's flex properties) */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
      </button>
    </div>
  );
};

export default RelayStatus; 