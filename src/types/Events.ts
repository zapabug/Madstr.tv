import { NostrEvent } from 'nostr-tools';

/**
 * Represents a Nostr event that has been processed or is intended for use
 * within the Applesauce context of this application, potentially with 
 * additional media-specific or derived fields.
 */
export interface ApplesauceEvent extends NostrEvent {
  /** The primary URL for the media content (e.g., image, video, audio file). */
  url?: string;

  /** The pubkey of the original poster or the relevant author for the content. */
  posterPubkey?: string;

  /** The title of the content, typically from a 'title' tag. */
  title?: string;

  /** A summary or description of the content, typically from a 'summary' tag. */
  summary?: string;

  /** A URL for a thumbnail or preview image, typically from an 'image' tag. */
  image?: string;

  /** The duration of the audio or video content, typically from a 'duration' tag. */
  duration?: string;

  // Add any other Applesauce-specific or processed fields as needed.
  // For example, if you have specific flags or states after processing:
  // isProcessed?: boolean;
  // extractedData?: ContentExtraction;
}

/**
 * Represents data extracted from event content, such as plain text or URLs.
 */
export interface ContentExtraction {
  /** The primary text content, possibly cleaned or summarized. */
  text?: string;

  /** Any URLs found or extracted from the content. */
  urls?: string[];
  // other extracted data relevant to your application
}

/**
 * Defines the expected structure of event content if it's more complex than a simple string.
 * By default, NostrEvent['content'] is a string.
 */
export type EventContent = string | object; // Example: could be parsed JSON if kind-specific

/**
 * A simple type alias for URLs, primarily for semantic clarity.
 */
export type Url = string;

// Specific note types (could extend ApplesauceEvent or NostrNote from '../types/nostr.ts')
// These can be used if you need to differentiate media types more strongly at the type level.
// Example:
// import { NostrNote } from './nostr'; // Assuming NostrNote is the primary processed type
// export interface ImageNote extends NostrNote { kind: 1063; }
// export interface VideoNote extends NostrNote { kind: 34235; }
// export interface PodcastNote extends NostrNote { /* specific podcast fields */ } 