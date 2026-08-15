const BOUNCEABLE_TAG = 0x11;
const NON_BOUNCEABLE_TAG = 0x51;
const TESTNET_FLAG = 0x80;

const FRIENDLY_ADDRESS_LENGTH = 36;
const RAW_ADDRESS_LENGTH = 32;

export interface FriendlyAddressInfo {
  workchain: number;
  hash: string;
  bounceable: boolean;
  testnet: boolean;
}

export type AddressKind = 'friendly' | 'raw' | 'invalid';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triplet >> 12) & 0x3f];
    out += BASE64URL_ALPHABET[(triplet >> 6) & 0x3f];
    out += BASE64URL_ALPHABET[triplet & 0x3f];
  }
  if (i < bytes.length) {
    const remaining = bytes.length - i;
    if (remaining === 1) {
      const b = bytes[i];
      out += BASE64URL_ALPHABET[(b >> 2) & 0x3f];
      out += BASE64URL_ALPHABET[(b << 4) & 0x3f];
    } else {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      out += BASE64URL_ALPHABET[(b1 >> 2) & 0x3f];
      out += BASE64URL_ALPHABET[((b1 << 4) | (b2 >> 4)) & 0x3f];
      out += BASE64URL_ALPHABET[(b2 << 2) & 0x3f];
    }
  }
  return out;
}

function base64UrlDecode(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, '');
  const lookup = new Int8Array(128);
  for (let i = 0; i < 128; i++) lookup[i] = -1;
  for (let i = 0; i < BASE64URL_ALPHABET.length; i++) {
    lookup[BASE64URL_ALPHABET.charCodeAt(i)] = i;
  }
  const len = cleaned.length;
  const outLen = Math.floor((len * 6) / 8);
  const out = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = lookup[cleaned.charCodeAt(i)];
    const c1 = lookup[cleaned.charCodeAt(i + 1)];
    const c2 = i + 2 < len ? lookup[cleaned.charCodeAt(i + 2)] : -1;
    const c3 = i + 3 < len ? lookup[cleaned.charCodeAt(i + 3)] : -1;
    if (p < outLen) out[p++] = ((c0 << 2) | (c1 >> 4)) & 0xff;
    if (c2 >= 0 && p < outLen) out[p++] = ((c1 << 4) | (c2 >> 2)) & 0xff;
    if (c3 >= 0 && p < outLen) out[p++] = ((c2 << 6) | c3) & 0xff;
  }
  return out;
}

function crc16(data: Uint8Array): Uint8Array {
  const poly = 0x1021;
  let reg = 0;
  const message = new Uint8Array(data.length + 2);
  message.set(data);
  for (const byte of message) {
    let mask = 0x80;
    while (mask > 0) {
      reg <<= 1;
      if (byte & mask) reg += 1;
      mask >>= 1;
      if (reg > 0xffff) {
        reg &= 0xffff;
        reg ^= poly;
      }
    }
  }
  return new Uint8Array([Math.floor(reg / 256), reg % 256]);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Hex string must have even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new Error('Invalid hex character');
    out[i] = byte;
  }
  return out;
}

export function detectKind(input: string): AddressKind {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'invalid';
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(trimmed)) return 'raw';
  if (trimmed.length === 48 && /^[A-Za-z0-9_-]+$/.test(trimmed)) return 'friendly';
  return 'invalid';
}

export function parseFriendly(address: string): FriendlyAddressInfo {
  const decoded = base64UrlDecode(address);
  if (decoded.length !== FRIENDLY_ADDRESS_LENGTH) {
    throw new Error('Friendly address must decode to 36 bytes');
  }
  const storedCrc = decoded.subarray(34, 36);
  const computed = crc16(decoded.subarray(0, 34));
  if (storedCrc[0] !== computed[0] || storedCrc[1] !== computed[1]) {
    throw new Error('Invalid CRC16 checksum');
  }
  const tag = decoded[0];
  const testnet = (tag & TESTNET_FLAG) !== 0;
  const tagBase = testnet ? tag & ~TESTNET_FLAG : tag;
  const workchain = (decoded[1] << 24) >> 24;
  const hash = bytesToHex(decoded.subarray(2, 34));
  const bounceable = tagBase === BOUNCEABLE_TAG;
  return { workchain, hash, bounceable, testnet };
}

export function parseRaw(address: string): FriendlyAddressInfo {
  const colon = address.indexOf(':');
  if (colon < 0) throw new Error('Raw address must have workchain:hash form');
  const wcStr = address.slice(0, colon);
  const hashHex = address.slice(colon + 1);
  const workchain = parseInt(wcStr, 10);
  if (Number.isNaN(workchain)) throw new Error('Workchain must be a signed integer');
  if (hashHex.length !== RAW_ADDRESS_LENGTH * 2) {
    throw new Error('Raw hash must be 64 hex characters');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hashHex)) throw new Error('Raw hash contains non-hex characters');
  return { workchain, hash: hashHex.toLowerCase(), bounceable: true, testnet: false };
}

export function buildFriendly(info: FriendlyAddressInfo): string {
  const tagBase = info.bounceable ? BOUNCEABLE_TAG : NON_BOUNCEABLE_TAG;
  const tag = info.testnet ? tagBase | TESTNET_FLAG : tagBase;
  const workchainSigned = info.workchain & 0xff;
  const hashBytes = hexToBytes(info.hash);
  if (hashBytes.length !== RAW_ADDRESS_LENGTH) {
    throw new Error('Hash must be 32 bytes');
  }
  const out = new Uint8Array(FRIENDLY_ADDRESS_LENGTH);
  out[0] = tag;
  out[1] = workchainSigned;
  out.set(hashBytes, 2);
  const crc = crc16(out.subarray(0, 34));
  out[34] = crc[0];
  out[35] = crc[1];
  return base64UrlEncode(out);
}

export function formatRaw(info: FriendlyAddressInfo): string {
  return `${info.workchain}:${info.hash}`;
}

export function toggleBounceable(info: FriendlyAddressInfo): FriendlyAddressInfo {
  return { ...info, bounceable: !info.bounceable };
}

export function toggleTestnet(info: FriendlyAddressInfo): FriendlyAddressInfo {
  return { ...info, testnet: !info.testnet };
}

export const TONCENTER_TESTNET = 'https://testnet.toncenter.com/api/v2';

export async function fetchAccountState(address: string): Promise<{ balance: string; state: string } > {
  const url = `${TONCENTER_TESTNET}/getAddressInformation?address=${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Network error reaching toncenter testnet: ${(err as Error).message || 'request failed'}`);
  }
  if (!res.ok) throw new Error(`toncenter HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'toncenter returned not ok');
  return {
    balance: json.result.balance,
    state: json.result.state,
  };
}

export async function fetchAddressBalance(address: string): Promise<string> {
  const info = await fetchAccountState(address);
  return info.balance;
}
