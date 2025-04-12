import React from 'react';
import { RELAYS } from '../constants';

interface RelayStatusProps {
  isReceivingData: boolean; // Simple flag to indicate if any hook has data
}

const RelayStatus: React.FC<RelayStatusProps> = ({ isReceivingData }) => {
  const relayCount = RELAYS.length;

  const getTextColor = () => {
    if (!isReceivingData) {
      return 'text-gray-400'; // No data received yet: Gray
    }
    if (relayCount <= 2) {
      return 'text-orange-400 font-bold'; // Receiving data, 1-2 relays: Orange, Bold
    }
    // Receiving data, 3+ relays
    return 'text-green-400 font-bold'; // Receiving data, 3+ relays: Green, Bold
  };

  return (
    // Ultra-minimal overlay: color based on connection status and relay count
    <div className="absolute bottom-1 left-1 z-10 text-xs">
      <span className={getTextColor()}>
        {relayCount}
      </span>
    </div>
  );
};

export default RelayStatus; 