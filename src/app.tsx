import { useState } from 'preact/hooks';
import {
  detectKind,
  parseFriendly,
  parseRaw,
  buildFriendly,
  formatRaw,
  toggleBounceable,
  toggleTestnet,
  fetchAccountState,
} from './ton';
import type { FriendlyAddressInfo } from './ton';
interface ConversionState {
  raw: string;
  bounceable: string;
  nonBounceable: string;
  testnetBounceable: string;
  testnetNonBounceable: string;
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

function fmtNano(nano: string): string {
  const n = BigInt(nano);
  const whole = n / 1_000_000_000n;
  const frac = n % 1_000_000_000n;
  return `${whole.toString()}.${frac.toString().padStart(9, '0')} TON`;
}

function buildAll(info: FriendlyAddressInfo): ConversionState {
  return {
    raw: formatRaw(info),
    bounceable: buildFriendly({ ...info, bounceable: true, testnet: false }),
    nonBounceable: buildFriendly({ ...info, bounceable: false, testnet: false }),
    testnetBounceable: buildFriendly({ ...info, bounceable: true, testnet: true }),
    testnetNonBounceable: buildFriendly({ ...info, bounceable: false, testnet: true }),
  };
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div class="row">
      <code class="addr">{value}</code>
      <button type="button" class="copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState('EQDrLq-X6jKZNHAScgghh0h1iog3StK71zn8dcmrOj8jPWRA');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState<ConversionState | null>(null);
  const [info, setInfo] = useState<FriendlyAddressInfo | null>(null);
  const [liveBalance, setLiveBalance] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<Status>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);

  function handleConvert(e: Event) {
    e.preventDefault();
    const trimmed = input.trim();
    const kind = detectKind(trimmed);
    if (kind === 'invalid') {
      setError('Input must be a 48-char friendly (base64url) address or a raw "wc:hash64" address.');
      setStatus('error');
      setConverted(null);
      setInfo(null);
      setLiveBalance(null);
      setLiveState(null);
      setLiveStatus('idle');
      setLiveError(null);
      return;
    }
    try {
      const parsed = kind === 'friendly' ? parseFriendly(trimmed) : parseRaw(trimmed);
      setInfo(parsed);
      setConverted(buildAll(parsed));
      setError(null);
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse error');
      setStatus('error');
      setConverted(null);
      setInfo(null);
    }
  }

  function flipBounceable() {
    if (!info) return;
    const flipped = toggleBounceable(info);
    setInfo(flipped);
    setConverted(buildAll(flipped));
  }

  function flipTestnet() {
    if (!info) return;
    const flipped = toggleTestnet(info);
    setInfo(flipped);
    setConverted(buildAll(flipped));
  }

  function clearAll() {
    setInput('');
    setError(null);
    setStatus('idle');
    setConverted(null);
    setInfo(null);
    setLiveBalance(null);
    setLiveState(null);
    setLiveStatus('idle');
    setLiveError(null);
  }

  async function lookupLive() {
    if (!converted) return;
    setLiveStatus('loading');
    setLiveError(null);
    setLiveBalance(null);
    setLiveState(null);
    try {
      const res = await fetchAccountState(converted.raw);
      setLiveBalance(fmtNano(res.balance));
      setLiveState(res.state);
      setLiveStatus('ok');
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Lookup failed');
      setLiveStatus('error');
    }
  }

  return (
    <div class="app">
      <header class="hero">
        <h1>TON Address Converter</h1>
        <p>Convert raw and friendly forms, flip bounceable and testnet flags, validate format, look up testnet state — all read-only, no wallet.</p>
      </header>

      <section class="card">
        <form onSubmit={handleConvert} class="form">
          <label for="addr">Address</label>
          <textarea
            id="addr"
            rows={2}
            placeholder="EQ... / UQ... / Ef... / 0:abc123..."
            value={input}
            onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)}
          />
          <div class="actions">
            <button type="submit" class="primary" disabled={status === 'loading'}>Convert</button>
            <button type="button" class="ghost" onClick={clearAll}>Clear</button>
            <button type="button" class="ghost" onClick={lookupLive} disabled={!converted || liveStatus === 'loading'}>
              {liveStatus === 'loading' ? 'Looking up...' : 'Lookup on testnet'}
            </button>
          </div>
        </form>
      </section>

      {status === 'error' && error && (
        <section class="card error">
          <strong>Invalid input</strong>
          <p>{error}</p>
        </section>
      )}

      {status === 'ok' && converted && info && (
        <>
          <section class="card">
            <h2>Decoded</h2>
            <div class="grid">
              <div>
                <span class="label">Workchain</span>
                <span class="value">{info.workchain}</span>
              </div>
              <div>
                <span class="label">Hash (32 bytes)</span>
                <span class="value mono">{info.hash}</span>
              </div>
              <div>
                <span class="label">Bounceable</span>
                <span class="value">{info.bounceable ? 'yes' : 'no'}</span>
              </div>
              <div>
                <span class="label">Network</span>
                <span class="value">{info.testnet ? 'testnet' : 'mainnet'}</span>
              </div>
            </div>
            <div class="flags">
              <button type="button" onClick={flipBounceable}>Toggle bounceable</button>
              <button type="button" onClick={flipTestnet}>Toggle testnet</button>
            </div>
          </section>

          <section class="card">
            <h2>Raw form</h2>
            <Copyable value={converted.raw} />
          </section>

          <section class="card">
            <h2>Friendly (mainnet)</h2>
            <div class="group">
              <span class="label">Bounceable (<code>EQ</code>)</span>
              <Copyable value={converted.bounceable} />
            </div>
            <div class="group">
              <span class="label">Non-bounceable (<code>UQ</code>)</span>
              <Copyable value={converted.nonBounceable} />
            </div>
          </section>

          <section class="card">
            <h2>Friendly (testnet)</h2>
            <div class="group">
              <span class="label">Bounceable (<code>EQ</code>)</span>
              <Copyable value={converted.testnetBounceable} />
            </div>
            <div class="group">
              <span class="label">Non-bounceable (<code>UQ</code>)</span>
              <Copyable value={converted.testnetNonBounceable} />
            </div>
          </section>

          <section class="card">
            <h2>Live testnet state</h2>
            {liveStatus === 'idle' && <p class="muted">Click "Lookup on testnet" to fetch from toncenter.</p>}
            {liveStatus === 'loading' && <p>Loading...</p>}
            {liveStatus === 'error' && <p class="error-text">Error: {liveError}</p>}
            {liveStatus === 'ok' && (
              <div class="grid">
                <div>
                  <span class="label">Balance</span>
                  <span class="value">{liveBalance}</span>
                </div>
                <div>
                  <span class="label">State</span>
                  <span class="value">{liveState}</span>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <footer class="foot">
        <p>Framework: preact-vite · Endpoint: <a href="https://testnet.toncenter.com/api/v2" target="_blank" rel="noopener noreferrer">testnet.toncenter.com/api/v2</a></p>
      </footer>
    </div>
  );
}
