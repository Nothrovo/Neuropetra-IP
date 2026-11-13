import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from '../lib/clipboard';

describe('copyTextToClipboard utility', () => {
  const originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocumentDesc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  let mockDocument: {
    createElement: ReturnType<typeof vi.fn>;
    body: {
      appendChild: ReturnType<typeof vi.fn>;
      removeChild: ReturnType<typeof vi.fn>;
    };
    execCommand: ReturnType<typeof vi.fn>;
  };

  let mockTextarea: {
    value: string;
    style: Record<string, string>;
    setAttribute: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    setSelectionRange: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTextarea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };

    mockDocument = {
      createElement: vi.fn().mockReturnValue(mockTextarea),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand: vi.fn().mockReturnValue(true),
    };

    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: mockDocument,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindowDesc) Object.defineProperty(globalThis, 'window', originalWindowDesc);
    else delete (globalThis as unknown as { window?: unknown }).window;

    if (originalDocumentDesc) Object.defineProperty(globalThis, 'document', originalDocumentDesc);
    else delete (globalThis as unknown as { document?: unknown }).document;

    if (originalNavigatorDesc) Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    else delete (globalThis as unknown as { navigator?: unknown }).navigator;
  });

  it('returns false when window is undefined (SSR)', async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const result = await copyTextToClipboard('1.2.3.4');
    expect(result).toBe(false);
  });

  it('uses navigator.clipboard.writeText in secure context when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('192.168.1.1');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('192.168.1.1');
    expect(mockDocument.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to document.execCommand in insecure HTTP context when navigator.clipboard is undefined', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('10.20.100.117');
    expect(result).toBe(true);
    expect(mockDocument.createElement).toHaveBeenCalledWith('textarea');
    expect(mockTextarea.value).toBe('10.20.100.117');
    expect(mockDocument.body.appendChild).toHaveBeenCalledWith(mockTextarea);
    expect(mockTextarea.select).toHaveBeenCalled();
    expect(mockDocument.execCommand).toHaveBeenCalledWith('copy');
    expect(mockDocument.body.removeChild).toHaveBeenCalledWith(mockTextarea);
  });

  it('falls back to document.execCommand if navigator.clipboard.writeText rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard('sample-text');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('sample-text');
    expect(mockDocument.execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false gracefully when both modern and fallback mechanisms fail', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    mockDocument.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('Not supported');
    });

    const result = await copyTextToClipboard('fail-text');
    expect(result).toBe(false);
  });
});
