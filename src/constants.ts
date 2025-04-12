export const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
];

// !!! IMPORTANT !!!
// Replace this placeholder with the ACTUAL HEX EVENT ID of the main post
// that you manually published using the TV's nsec.
// This post should be the starting point for the on-screen chat thread.
export const MAIN_THREAD_EVENT_ID_HEX = '51d94f1d6c44d3403e757dee2e80a3507c277c3f367e0e82747e27a587be4464'; // Updated with correct hex ID from nevent

// Full nevent URI for the QR code
export const MAIN_THREAD_NEVENT_URI = 'nostr:nevent1qqsr4ljerh8aj8jwp27mh7xq2tzu8cw9sz9nh24r0p5xr065xcn4v4gpz3mhxw309ucnydewxqhrqt338g6rsd3e9upzpmgenu35prtljrk88pa349s86ktzatsm4796ggwtse9qjyyaxf3tqvzqqqqqqy2ccvfk'; // Updated with user-provided nevent

// Hex public key for the TV instance (No longer needed - removed)
// export const TV_PUBKEY_HEX = 'a5ve7g6q34lepmrns7c6jcrat93w4cd6lzayy89cvjsfzzwnyc4s6a66d8';

// New Main Post Content
export const MAIN_POST_CONTENT = "Hi, this is TugaTv welcome to the new chat line"; 