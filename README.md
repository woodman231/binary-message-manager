# @woodman231/binary-message-manager

[![npm version](https://img.shields.io/npm/v/@woodman231/binary-message-manager.svg)](https://www.npmjs.com/package/@woodman231/binary-message-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Abstract base class for encoding, decoding, framing, and deframing binary messages with full streaming support.

## Features

- **Protocol agnostic** - Implement your own framing format (length-prefixed, delimited, etc.)
- **Streaming support** - Handle partial chunks from TCP, WebSocket, or file streams
- **Web Streams API** - Works with `ReadableStream`, `WritableStream`, `TransformStream`
- **Dual module support** - Works with both ESM and CommonJS
- **Cross-platform** - Works in browsers and Node.js 16.5+

## Installation

```bash
npm install @woodman231/binary-message-manager
```

## Quick Start

Extend `BinaryMessageManager` and implement the 5 abstract methods:

```typescript
import { BinaryMessageManager } from '@woodman231/binary-message-manager';

class StringMessageManager extends BinaryMessageManager<string> {
    private textEncoder = new TextEncoder();
    private textDecoder = new TextDecoder();

    // Convert your message type to bytes
    encode(message: string): Uint8Array {
        return this.textEncoder.encode(message);
    }

    // Convert bytes back to your message type
    decode(buffer: Uint8Array): string {
        return this.textDecoder.decode(buffer);
    }

    // Add framing (e.g., length prefix) to a buffer
    frameBuffer(buffer: Uint8Array): Uint8Array {
        // Frame format: [4 bytes length][payload]
        const framed = new Uint8Array(4 + buffer.length);
        const view = new DataView(framed.buffer);
        view.setUint32(0, buffer.length, true); // little-endian length
        framed.set(buffer, 4);
        return framed;
    }

    // Remove framing and return the payload
    deframeBuffer(buffer: Uint8Array): Uint8Array {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const length = view.getUint32(0, true);
        return buffer.subarray(4, 4 + length);
    }

    // Return total framed message length (for parsing multiple messages)
    getFramedMessageLength(buffer: Uint8Array): number {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const payloadLength = view.getUint32(0, true);
        return 4 + payloadLength;
    }
}
```

## API Reference

### Abstract Methods (You Must Implement)

| Method | Description |
|--------|-------------|
| `encode(message: T): Uint8Array` | Convert a message to bytes |
| `decode(buffer: Uint8Array): T` | Convert bytes to a message |
| `frameBuffer(buffer: Uint8Array): Uint8Array` | Add framing (length prefix, delimiters, etc.) |
| `deframeBuffer(buffer: Uint8Array): Uint8Array` | Remove framing, return payload |
| `getFramedMessageLength(buffer: Uint8Array): number` | Return total length of one framed message |

### Batch Operations

| Method | Description |
|--------|-------------|
| `encodeAndFrameManyMessages(messages: T[]): Uint8Array` | Encode and frame multiple messages into one buffer |
| `deframeAndDecodeAllFromBuffer(buffer: Uint8Array): T[]` | Deframe and decode all messages from a buffer |
| `countFramedMessagesInBuffer(buffer: Uint8Array): number` | Count messages in a buffer |

### Streaming Deframers

For handling partial data from network streams:

```typescript
// Synchronous streaming deframer
const deframer = manager.createStreamingDeframer();

socket.on('data', (chunk) => {
    const messages = deframer.push(chunk);
    for (const message of messages) {
        handleMessage(message);
    }
});

// Check for incomplete data
if (deframer.hasPartialMessage()) {
    console.log('Waiting for more data...');
}
```

```typescript
// Async streaming deframer with for-await
const deframer = manager.createAsyncStreamingDeframer();

socket.on('data', (chunk) => deframer.push(new Uint8Array(chunk)));
socket.on('end', () => deframer.end());
socket.on('error', (err) => deframer.error(err));

for await (const message of deframer.messages()) {
    await processMessage(message);
}
```

### ReadableStream Integration

```typescript
// With fetch
const response = await fetch('/api/messages');
for await (const message of manager.deframeFromReadableStream(response.body!)) {
    handleMessage(message);
}

// With Node.js HTTP
import { Readable } from 'stream';
const webStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;
for await (const message of manager.deframeFromReadableStream(webStream)) {
    handleMessage(message);
}
```

### TransformStream Integration

```typescript
// Pipe-based processing
const processedStream = inputStream
    .pipeThrough(manager.createDeframingTransformStream())
    .pipeThrough(yourProcessingTransform)
    .pipeThrough(manager.createFramingTransformStream());

await processedStream.pipeTo(outputStream);
```

### WritableStream Integration

```typescript
// Send messages to a stream
const writable = manager.createFramingWritableStream(destination);
const writer = writable.getWriter();

await writer.write({ type: 'hello' });
await writer.write({ type: 'world' });
await writer.close();
```

### Message Sources

```typescript
// Pipe an iterable of messages to a stream
async function* generateMessages() {
    yield 'Hello';
    yield 'World';
}
await manager.pipeMessagesToStream(generateMessages(), outputStream);

// Create a ReadableStream from messages
const stream = manager.createReadableStreamFromMessages(['Hello', 'World']);
await fetch('/api', { method: 'POST', body: stream, duplex: 'half' });
```

### Bidirectional Streams

```typescript
const { readable, writable } = manager.createBidirectionalStreams(
    incomingBinaryStream,
    outgoingBinaryStream
);

// Send messages
const writer = writable.getWriter();
await writer.write({ type: 'request', id: 1 });

// Receive messages
for await (const message of readable) {
    handleMessage(message);
}
```

## Usage Examples

### HTTP Request/Response Streaming

```typescript
import http from 'http';
import { Readable, Writable } from 'stream';

const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });

    const inputStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;

    // Process each message and echo it back
    const processedStream = inputStream
        .pipeThrough(manager.createDeframingTransformStream())
        .pipeThrough(new TransformStream({
            transform(message, controller) {
                controller.enqueue(`Echo: ${message}`);
            }
        }))
        .pipeThrough(manager.createFramingTransformStream());

    await processedStream.pipeTo(Writable.toWeb(res));
});

// Client
const response = await fetch('http://localhost:3000', {
    method: 'POST',
    body: manager.encodeAndFrameManyMessages(['Hello', 'World'])
});

for await (const message of manager.deframeFromReadableStream(response.body!)) {
    console.log('Received:', message);
}
```

### Handling Partial Chunks

The streaming deframer correctly handles messages split across multiple chunks:

```typescript
import { createReadStream } from 'fs';
import { Readable } from 'stream';

// Low highWaterMark forces small chunks that split messages
const readStream = createReadStream('messages.bin', { highWaterMark: 8 });
const webStream = Readable.toWeb(readStream) as ReadableStream<Uint8Array>;

// Messages are correctly reassembled regardless of chunk boundaries
for await (const message of manager.deframeFromReadableStream(webStream)) {
    console.log('Complete message:', message);
}
```

### Network Simulation with Bidirectional Streams

```typescript
// Create bidirectional "pipes"
const { readable: serverReceives, writable: clientSends } = new TransformStream<Uint8Array>();
const { readable: clientReceives, writable: serverSends } = new TransformStream<Uint8Array>();

// Client sends, then receives
const clientTask = async () => {
    await manager.pipeMessagesToStream(['Hello', 'World'], clientSends);
    
    for await (const msg of manager.deframeFromReadableStream(clientReceives)) {
        console.log('Client received:', msg);
    }
};

// Server receives, processes, and responds
const serverTask = async () => {
    const received: string[] = [];
    for await (const msg of manager.deframeFromReadableStream(serverReceives)) {
        received.push(msg);
    }
    
    const responses = received.map(m => `Echo: ${m}`);
    await manager.pipeMessagesToStream(responses, serverSends);
};

await Promise.all([clientTask(), serverTask()]);
```

## Requirements

- Node.js 16.5+ (for Web Streams API support)
- Modern browsers with Web Streams API support

## License

[MIT](LICENSE)
