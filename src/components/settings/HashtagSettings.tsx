import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FiPlusCircle, FiXCircle } from 'react-icons/fi';
import { useAuthContext } from '../../context/AuthContext';
import { DEFAULT_FOLLOWED_TAGS } from '../../hooks/useAuth';

interface HashtagSettingsProps {
    setDisplayError: (error: string | null) => void;
}

const HashtagSettings: React.FC<HashtagSettingsProps> = ({ setDisplayError }) => {
    const { followedTags, setFollowedTags } = useAuthContext();

    const [hashtagInput, setHashtagInput] = useState<string>('');
    const [focusedTagIndex, setFocusedTagIndex] = useState<number | null>(null);

    const hashtagInputRef = useRef<HTMLInputElement>(null);
    const addTagButtonRef = useRef<HTMLButtonElement>(null);
    const tagListRef = useRef<HTMLUListElement>(null);

    const suggestedTags = useMemo(() => {
        if (!followedTags) return DEFAULT_FOLLOWED_TAGS;
        return DEFAULT_FOLLOWED_TAGS.filter(tag => !followedTags.includes(tag));
    }, [followedTags]);

    const handleAddTag = useCallback((tagToAdd: string) => {
        const cleanTag = tagToAdd.trim().toLowerCase().replace(/^#+/, '');
        setDisplayError(null);
        if (cleanTag && followedTags && !followedTags.includes(cleanTag) && setFollowedTags) {
            const newTags = [...followedTags, cleanTag];
            setFollowedTags(newTags);
            setHashtagInput('');
            setFocusedTagIndex(null);
            setTimeout(() => hashtagInputRef.current?.focus(), 50);
        } else if (!cleanTag) {
            setDisplayError("Please enter or select a tag to add.");
        } else if (followedTags && followedTags.includes(cleanTag)) {
            setDisplayError(`Tag "#${cleanTag}" is already followed.`);
        } else {
            setDisplayError("Could not add tag.");
        }
    }, [followedTags, setFollowedTags, setDisplayError]);

    const handleAddTagFromInput = useCallback(() => {
        handleAddTag(hashtagInput);
    }, [handleAddTag, hashtagInput]);

    const handleRemoveTag = useCallback((tagToRemove: string) => {
        setDisplayError(null);
        if (followedTags && setFollowedTags) {
            const newTags = followedTags.filter(tag => tag !== tagToRemove);
            setFollowedTags(newTags);
            setFocusedTagIndex(null);
            setTimeout(() => addTagButtonRef.current?.focus(), 50);
        }
    }, [followedTags, setFollowedTags, setDisplayError]);

    const handleTagListKeyDown = useCallback((event: React.KeyboardEvent<HTMLLIElement>, index: number, tag: string, isSuggestionList: boolean) => {
        const currentList = isSuggestionList ? suggestedTags : followedTags;
        if (!currentList) return;

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                if (index > 0) {
                    setFocusedTagIndex(index - 1);
                } else {
                    hashtagInputRef.current?.focus();
                    setFocusedTagIndex(null);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (index < currentList.length - 1) {
                    setFocusedTagIndex(index + 1);
                } else {
                    setFocusedTagIndex(index);
                }
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (isSuggestionList) {
                    handleAddTag(tag);
                } else {
                    handleRemoveTag(tag);
                }
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                hashtagInputRef.current?.focus();
                setFocusedTagIndex(null);
                break;
        }
    }, [followedTags, suggestedTags, handleAddTag, handleRemoveTag]);

    useEffect(() => {
        if (focusedTagIndex !== null && tagListRef.current?.children[focusedTagIndex]) {
            (tagListRef.current.children[focusedTagIndex] as HTMLLIElement).focus();
        }
    }, [focusedTagIndex]);

    const hasFollowedTags = followedTags && followedTags.length > 0;

    return (
        <div className="mb-4 mt-4 pt-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
            <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1 text-center">
                Follow Hashtags
            </h3>
            <>
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-gray-400">#</span>
                    <input
                        ref={hashtagInputRef}
                        type="text"
                        value={hashtagInput}
                        onChange={(e) => setHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="custom_tag"
                        className="flex-grow px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                        aria-label="Enter custom hashtag to follow (without #)"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddTagFromInput();
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const listElement = tagListRef.current?.children[0] as HTMLElement | undefined;
                                if (listElement) {
                                    setFocusedTagIndex(0);
                                    listElement.focus();
                                }
                            }
                        }}
                        onFocus={() => setFocusedTagIndex(null)}
                    />
                    <button
                        ref={addTagButtonRef}
                        onClick={handleAddTagFromInput}
                        disabled={!hashtagInput.trim()}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-sm font-semibold"
                    >
                        Add
                    </button>
                </div>

                {hasFollowedTags ? (
                    <div className="mb-3">
                        <p className="text-sm font-medium text-gray-400 mb-1">Followed (OK to remove):</p>
                        <ul ref={tagListRef} className="max-h-32 overflow-y-auto space-y-1 bg-gray-800/50 p-2 rounded border border-gray-600">
                            {followedTags.map((tag: string, index: number) => (
                                <li
                                    key={tag}
                                    tabIndex={0}
                                    className={`px-2 py-1 rounded text-sm cursor-pointer flex justify-between items-center transition-colors ${focusedTagIndex === index ? 'bg-purple-700 text-white ring-2 ring-purple-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} focus:outline-none focus:bg-purple-700 focus:text-white focus:ring-2 focus:ring-purple-400`}
                                    onFocus={() => setFocusedTagIndex(index)}
                                    onKeyDown={(e) => handleTagListKeyDown(e, index, tag, false)}
                                    aria-label={`Following tag #${tag}. Press OK to remove.`}
                                >
                                    <span>#{tag}</span>
                                    <FiXCircle className="w-4 h-4 text-red-400 opacity-70 ml-2" />
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div>
                        <p className="text-sm font-medium text-gray-400 mb-1">Suggestions (OK to add):</p>
                        <ul ref={tagListRef} className="max-h-32 overflow-y-auto space-y-1 bg-gray-800/30 p-2 rounded border border-gray-700">
                            {suggestedTags.map((tag: string, index: number) => (
                                <li
                                    key={tag}
                                    tabIndex={0}
                                    className={`px-2 py-1 rounded text-sm cursor-pointer flex justify-between items-center transition-colors ${focusedTagIndex === index ? 'bg-green-700 text-white ring-2 ring-green-400' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'} focus:outline-none focus:bg-green-700 focus:text-white focus:ring-2 focus:ring-green-400`}
                                    onFocus={() => setFocusedTagIndex(index)}
                                    onKeyDown={(e) => handleTagListKeyDown(e, index, tag, true)}
                                    aria-label={`Suggest tag #${tag}. Press OK to add.`}
                                >
                                    <span>#{tag}</span>
                                    <FiPlusCircle className="w-4 h-4 text-green-400 opacity-70 ml-2" />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </>
        </div>
    );
};

export default HashtagSettings; 