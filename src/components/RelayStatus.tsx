import React from 'react';

interface RelayStatusProps {
  isReceivingData: boolean; 
  relayCount: number; 
  onSettingsClick: () => void; 
}

// TEMPORARILY SIMPLIFIED FOR DEBUGGING VISIBILITY
const RelayStatus: React.FC<RelayStatusProps> = ({ isReceivingData, relayCount, onSettingsClick }) => {
  console.log('[RelayStatus Render] relayCount:', relayCount);
  return (
    // Added bright background and border for visibility test
    <div 
      className="p-1 border-2 border-red-500 bg-yellow-300" 
      onClick={onSettingsClick} // Attach click handler to div for now
      role="button" // Add role for accessibility
      tabIndex={0} // Make div focusable
      title={`Relays: ${relayCount} (Click for settings)`}
    >
      <span 
        className={`text-xs font-bold text-black`} // Make text black and bold for contrast
      >
         {relayCount} 
      </span>
      {/* Button temporarily removed */}
    </div>
  );
};

export default RelayStatus;
// END TEMPORARY SIMPLIFICATION 