import React, { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { FiRefreshCw } from 'react-icons/fi';
import { Modal } from '../Modal';
import { SettingsModalLayout } from '../SettingsModalLayout';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { isLoggedIn, wallet } = useAuth();

  const handleLogout = useCallback(() => {
    // Implement logout functionality
  }, []);

  // Balance display for fixed position at top
  const balanceDisplay = isLoggedIn && wallet && (
    <div className="flex items-center gap-2 mb-4">
      <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
        Balance: {wallet.balanceSats.toLocaleString()} sats
      </p>
      <button
        onClick={wallet.refreshBalance}
        disabled={wallet.isRefreshingBalance}
        className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 transition-opacity"
        aria-label="Refresh balance"
      >
        <FiRefreshCw
          className={`w-5 h-5 ${wallet.isRefreshingBalance ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );

  const authSection = isLoggedIn ? (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Logged in as Nostr user</p>
        <p className="mt-1 text-sm text-blue-600 dark:text-blue-400 truncate">{wallet.pubkey}</p>
      </div>
      {/* Logout button moved here inside scrollable content */}
      <button
        onClick={handleLogout}
        className="w-full px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors"
      >
        Logout
      </button>
    </div>
  ) : (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">You are not logged in.</p>
      <button
        onClick={() => {/* Implement login */}}
        className="w-full px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors"
      >
        Login with Nostr
      </button>
    </div>
  );

  // Define missing sections
  const appearanceSection = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Appearance</h3>
      {/* Add appearance settings content here */}
    </div>
  );

  const languageSection = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Language</h3>
      {/* Add language settings content here */}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-md p-4 sm:p-6 md:max-w-lg lg:max-w-xl">
      <div className="flex flex-col h-full max-h-[80vh] sm:max-h-[90vh]">
        {/* Fixed header area with title and balance */}
        <div className="mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Settings</h2>
          {balanceDisplay}
        </div>
        
        {/* Scrollable content area */}
        <div className="flex-grow overflow-y-auto py-2 space-y-6">
          <SettingsModalLayout
            appearanceSection={appearanceSection}
            authSection={authSection}
            languageSection={languageSection}
          />
        </div>
        
        {/* Fixed footer area - logout button removed from here */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:focus:ring-offset-gray-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal; 