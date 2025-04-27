import React from 'react';

interface SettingsModalLayoutProps {
    authSection: React.ReactNode;
    walletSection: React.ReactNode | null; // Can be null if user not logged in
    mediaTogglesSection: React.ReactNode | null; // Can be null if user not logged in
    hashtagSection: React.ReactNode | null; // Can be null if user not logged in
}

const SettingsModalLayout: React.FC<SettingsModalLayoutProps> = ({
    authSection,
    walletSection,
    mediaTogglesSection,
    hashtagSection,
}) => {
    return (
        // This container takes up the flexible space and handles scrolling
        <div className="flex-grow space-y-4 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#8B5CF6 #374151' }}>
            {/* Render the sections passed as props in the desired order */}
            {authSection}
            {walletSection}
            {mediaTogglesSection}
            {hashtagSection}
        </div>
    );
};

export default SettingsModalLayout; 