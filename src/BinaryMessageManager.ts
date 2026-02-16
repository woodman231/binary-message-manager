export interface StreamingDeframer<TDecodedType> {
    /**
     * Push a chunk of data into the deframer.
     * Returns an array of complete messages that were fully received.
     */
    push(chunk: Uint8Array): TDecodedType[];

    /**
     * Push a chunk and get raw buffers instead of decoded messages.
     */
    pushRaw(chunk: Uint8Array): Uint8Array[];

    /**
     * Get any remaining partial data in the buffer.
     * Useful for debugging or connection cleanup.
     */
    getRemaining(): Uint8Array | null;

    /**
     * Check if there's partial data waiting for more bytes.
     */
    hasPartialMessage(): boolean;

    /**
     * Clear the internal buffer.
     */
    reset(): void;
}

export interface AsyncStreamingDeframer<TDecodedType> {
    /**
     * Push a chunk of data into the deframer.
     * Complete messages will be emitted through the async iterator.
     */
    push(chunk: Uint8Array): void;

    /**
     * Signal that no more data will be pushed.
     * This resolves the async iterator.
     */
    end(): void;

    /**
     * Signal an error occurred.
     * This rejects the async iterator.
     */
    error(err: Error): void;

    /**
     * Check if there's partial data waiting for more bytes.
     */
    hasPartialMessage(): boolean;

    /**
     * Async iterator for consuming decoded messages.
     */
    messages(): AsyncIterable<TDecodedType>;

    /**
     * Async iterator for consuming raw deframed buffers.
     */
    rawBuffers(): AsyncIterable<Uint8Array>;
}

export abstract class BinaryMessageManager<TDecodedType> {
    abstract encode(message: TDecodedType): Uint8Array;
    abstract decode(message: Uint8Array): TDecodedType;
    abstract frameBuffer(buffer: Uint8Array): Uint8Array;
    abstract deframeBuffer(buffer: Uint8Array): Uint8Array;
    abstract getFramedMessageLength(buffer: Uint8Array): number;

    /**
     * Frames multiple buffers into a single buffer.
     * This method takes an array of buffers, frames each one using the `frameBuffer` method, and concatenates them into a single buffer.
     * Useful for sending multiple messages in a single transmission while maintaining the ability to deframe them correctly on the receiving end.
     * 
     * @param buffers An array of buffers to be framed.
     * @returns A single buffer containing all framed buffers.
     */
    frameManyBuffers(buffers: Uint8Array[]): Uint8Array {
        const framedBuffers = buffers.map(buffer => this.frameBuffer(buffer));
        const totalLength = framedBuffers.reduce((sum, buf) => sum + buf.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buf of framedBuffers) {
            result.set(buf, offset);
            offset += buf.length;
        }
        return result;
    }

    /**
     * Deframes a buffer containing multiple framed buffers into an array of individual buffers.
     * This method takes a single buffer, deframes each contained buffer using the `deframeBuffer` method, and returns them as an array.
     * Useful for receiving multiple messages in a single transmission while maintaining the ability to process each message individually.
     * 
     * @param buffer A buffer containing multiple framed buffers.
     * @returns An array of individual buffers extracted from the input buffer.
     */
    deframeAllFromBuffer(buffer: Uint8Array): Uint8Array[] {
        const buffers: Uint8Array[] = [];
        let offset = 0;
        while (offset < buffer.length) {
            const deframed = this.deframeBuffer(buffer.subarray(offset));
            buffers.push(deframed);
            offset += this.getFramedMessageLength(buffer.subarray(offset)); // Move the offset by the length of the framed buffer
        }
        return buffers;
    }

    /**
     * An asynchronous generator version of `deframeAllFromBuffer` that yields each deframed buffer one at a time.
     * This allows for processing large buffers without needing to hold all deframed buffers in memory at once.
     * 
     * @param buffer A buffer containing multiple framed buffers.
     * @returns An async generator that yields individual buffers extracted from the input buffer.
     */
    async* deframeAllFromBufferGenerator(buffer: Uint8Array): AsyncGenerator<Uint8Array> {
        let offset = 0;
        while (offset < buffer.length) {
            const deframed = this.deframeBuffer(buffer.subarray(offset));
            yield deframed;
            offset += this.getFramedMessageLength(buffer.subarray(offset)); // Move the offset by the length of the framed buffer
        }
    }

    /**
     * Decodes multiple buffers into an array of decoded messages.
     * This method takes an array of buffers, decodes each one using the `decode` method, and returns them as an array of decoded messages.
     * Useful for processing multiple messages in a single transmission while maintaining the ability to handle each message individually.
     * 
     * @param buffers An array of buffers to be decoded.
     * @returns An array of decoded messages.
     */
    decodeManyBuffers(buffers: Uint8Array[]): TDecodedType[] {
        return buffers.map(buffer => this.decode(buffer));
    }

    /**
     * An asynchronous generator version of `decodeManyBuffers` that yields each decoded message one at a time.
     * This allows for processing large arrays of buffers without needing to hold all decoded messages in memory at once.
     * 
     * @param buffers An async iterable of buffers to be decoded.
     * @returns An async generator that yields individual decoded messages.
     */
    async* decodeManyBuffersGenerator(buffers: AsyncIterable<Uint8Array>): AsyncGenerator<TDecodedType> {
        for await (const buffer of buffers) {
            yield this.decode(buffer);
        }
    }

    /**
     * Deframes and decodes a buffer containing multiple framed buffers into an array of decoded messages.
     * This method combines the functionality of `deframeAllFromBuffer` and `decodeManyBuffers` to take a single buffer, deframe it into individual buffers, decode each one, and return them as an array of decoded messages.
     * Useful for receiving multiple messages in a single transmission while maintaining the ability to process each message individually.
     * 
     * @param buffer A buffer containing multiple framed buffers.
     * @returns An array of decoded messages extracted from the input buffer.
     */
    deframeAndDecodeAllFromBuffer(buffer: Uint8Array): TDecodedType[] {
        const deframedBuffers = this.deframeAllFromBuffer(buffer);
        return this.decodeManyBuffers(deframedBuffers);
    }

    /**
     * Deframes and decodes a buffer containing multiple framed buffers into an async generator of decoded messages.
     * This method combines the functionality of `deframeAllFromBufferGenerator` and `decodeManyBuffersGenerator` to take a single buffer, deframe it into individual buffers, decode each one, and yield them as an async generator of decoded messages.
     * Useful for receiving multiple messages in a single transmission while maintaining the ability to process each message individually.
     * 
     * @param buffer A buffer containing multiple framed buffers.
     * @returns An async generator that yields individual decoded messages.
     */
    async* deframeAndDecodeAllFromBufferGenerator(buffer: Uint8Array): AsyncGenerator<TDecodedType> {
        for await (const deframed of this.deframeAllFromBufferGenerator(buffer)) {
            yield this.decode(deframed);
        }
    }

    /**
     * Encodes multiple messages into an array of buffers.
     * This method takes an array of messages, encodes each one using the `encode` method, and returns them as an array of buffers.
     * Useful for preparing multiple messages for transmission while maintaining the ability to handle each message individually.
     * 
     * @param messages An array of messages to be encoded.
     * @returns An array of encoded buffers.
     */
    encodeManyMessages(messages: TDecodedType[]): Uint8Array[] {
        return messages.map(message => this.encode(message));
    }

    /**
     * Encodes and frames multiple messages into a single buffer containing multiple framed buffers.     
     * 
     * @param messages An array of messages to be encoded and framed.
     * @returns A buffer containing the encoded and framed messages.
     */
    encodeAndFrameManyMessages(messages: TDecodedType[]): Uint8Array {
        const encodedBuffers = this.encodeManyMessages(messages);
        return this.frameManyBuffers(encodedBuffers);
    }

    /**
     * Counts the number of framed messages in a buffer.
     * 
     * @param buffer A buffer containing multiple framed messages.
     * @returns The number of framed messages in the buffer.
     */
    countFramedMessagesInBuffer(buffer: Uint8Array): number {
        let count = 0;
        let offset = 0;
        while (offset < buffer.length) {
            const messageLength = this.getFramedMessageLength(buffer.subarray(offset));
            if (messageLength <= 0 || offset + messageLength > buffer.length) {
                break; // Invalid message length, stop counting
            }
            count++;
            offset += messageLength; // Move to the next framed message
        }
        return count;
    }

    /**
     * Creates a streaming deframer that can handle partial message data.
     * Useful for TCP or WebSocket streams where data arrives in arbitrary chunks
     * that may not align with message boundaries.
     * 
     * @returns A StreamingDeframer instance
     * 
     * @example
     * ```typescript
     * const deframer = manager.createStreamingDeframer();
     * 
     * socket.on('data', (chunk) => {
     *     const messages = deframer.push(chunk);
     *     for (const message of messages) {
     *         handleMessage(message);
     *     }
     * });
     * ```
     */
    createStreamingDeframer(): StreamingDeframer<TDecodedType> {
        const manager = this;
        let buffer: Uint8Array = new Uint8Array(0);

        const appendToBuffer = (chunk: Uint8Array): void => {
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer, 0);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;
        };

        const extractCompleteFrames = (): Uint8Array[] => {
            const frames: Uint8Array[] = [];

            while (buffer.length > 0) {
                // Try to get the framed message length
                // This might fail if we don't have enough bytes for the header
                let frameLength: number;
                try {
                    frameLength = manager.getFramedMessageLength(buffer);
                } catch {
                    // Not enough data to determine frame length
                    break;
                }

                // Check if frame length is valid
                if (frameLength <= 0) {
                    break;
                }

                // Check if we have the complete frame
                if (buffer.length < frameLength) {
                    break;
                }

                // Extract the complete frame
                const frame = buffer.subarray(0, frameLength);
                const deframed = manager.deframeBuffer(frame);
                frames.push(deframed);

                // Remove processed data from buffer
                buffer = buffer.subarray(frameLength);
            }

            return frames;
        };

        return {
            push(chunk: Uint8Array): TDecodedType[] {
                appendToBuffer(chunk);
                const frames = extractCompleteFrames();
                return frames.map(frame => manager.decode(frame));
            },

            pushRaw(chunk: Uint8Array): Uint8Array[] {
                appendToBuffer(chunk);
                return extractCompleteFrames();
            },

            getRemaining(): Uint8Array | null {
                return buffer.length > 0 ? buffer.slice() : null;
            },

            hasPartialMessage(): boolean {
                return buffer.length > 0;
            },

            reset(): void {
                buffer = new Uint8Array(0);
            }
        };
    }

    /**
     * Creates an async streaming deframer that yields messages as an async iterable.
     * Useful for consuming messages with `for await...of` syntax.
     * 
     * @returns An AsyncStreamingDeframer instance
     * 
     * @example
     * ```typescript
     * const deframer = manager.createAsyncStreamingDeframer();
     * 
     * // Set up the data source
     * socket.on('data', (chunk) => deframer.push(new Uint8Array(chunk)));
     * socket.on('end', () => deframer.end());
     * socket.on('error', (err) => deframer.error(err));
     * 
     * // Consume messages with for await...of
     * for await (const message of deframer.messages()) {
     *     await processMessage(message);
     * }
     * ```
     */
    createAsyncStreamingDeframer(): AsyncStreamingDeframer<TDecodedType> {
        const manager = this;
        let buffer: Uint8Array = new Uint8Array(0);
        let ended = false;
        let error: Error | null = null;

        // Queue for messages waiting to be consumed
        const pendingMessages: Uint8Array[] = [];

        // Resolver for when consumer is waiting for messages
        let waitingResolver: ((value: void) => void) | null = null;

        const appendToBuffer = (chunk: Uint8Array): void => {
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer, 0);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;
        };

        const extractCompleteFrames = (): void => {
            while (buffer.length > 0) {
                let frameLength: number;
                try {
                    frameLength = manager.getFramedMessageLength(buffer);
                } catch {
                    break;
                }

                if (frameLength <= 0 || buffer.length < frameLength) {
                    break;
                }

                const frame = buffer.subarray(0, frameLength);
                const deframed = manager.deframeBuffer(frame);
                pendingMessages.push(deframed);

                buffer = buffer.subarray(frameLength);
            }

            // Wake up the consumer if it's waiting
            if (waitingResolver && (pendingMessages.length > 0 || ended || error)) {
                waitingResolver();
                waitingResolver = null;
            }
        };

        const createAsyncIterable = <T>(transform: (buf: Uint8Array) => T): AsyncIterable<T> => {
            return {
                [Symbol.asyncIterator](): AsyncIterator<T> {
                    return {
                        async next(): Promise<IteratorResult<T>> {
                            // If there's an error, throw it
                            if (error) {
                                throw error;
                            }

                            // If we have pending messages, return one
                            if (pendingMessages.length > 0) {
                                const raw = pendingMessages.shift()!;
                                return { value: transform(raw), done: false };
                            }

                            // If ended and no more messages, we're done
                            if (ended) {
                                return { value: undefined as T, done: true };
                            }

                            // Wait for more data
                            await new Promise<void>(resolve => {
                                waitingResolver = resolve;
                            });

                            // Recurse to handle the new state
                            return this.next();
                        }
                    };
                }
            };
        };

        return {
            push(chunk: Uint8Array): void {
                if (ended) {
                    throw new Error('Cannot push after end() has been called');
                }
                appendToBuffer(chunk);
                extractCompleteFrames();
            },

            end(): void {
                ended = true;
                if (waitingResolver) {
                    waitingResolver();
                    waitingResolver = null;
                }
            },

            error(err: Error): void {
                error = err;
                if (waitingResolver) {
                    waitingResolver();
                    waitingResolver = null;
                }
            },

            hasPartialMessage(): boolean {
                return buffer.length > 0;
            },

            messages(): AsyncIterable<TDecodedType> {
                return createAsyncIterable(buf => manager.decode(buf));
            },

            rawBuffers(): AsyncIterable<Uint8Array> {
                return createAsyncIterable(buf => buf);
            }
        };
    }

    /**
     * Creates an async generator that reads from a ReadableStream and yields decoded messages.
     * Handles message boundaries that may not align with stream chunks.
     * 
     * @param stream A ReadableStream of Uint8Array chunks
     * @returns An async generator that yields decoded messages
     * 
     * @example
     * ```typescript
     * // With fetch
     * const response = await fetch('/api/messages');
     * for await (const message of manager.deframeFromReadableStream(response.body!)) {
     *     handleMessage(message);
     * }
     * 
     * // With Node.js HTTP (converted to web stream)
     * import { Readable } from 'stream';
     * const webStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;
     * for await (const message of manager.deframeFromReadableStream(webStream)) {
     *     handleMessage(message);
     * }
     * ```
     */
    async *deframeFromReadableStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<TDecodedType> {
        const reader = stream.getReader();
        let buffer: Uint8Array = new Uint8Array(0);

        const appendToBuffer = (chunk: Uint8Array): void => {
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer, 0);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;
        };

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (value) {
                    appendToBuffer(value);
                }

                // Extract and yield all complete messages
                while (buffer.length > 0) {
                    let frameLength: number;
                    try {
                        frameLength = this.getFramedMessageLength(buffer);
                    } catch {
                        // Not enough data for header
                        break;
                    }

                    if (frameLength <= 0 || buffer.length < frameLength) {
                        break;
                    }

                    const frame = buffer.subarray(0, frameLength);
                    const deframed = this.deframeBuffer(frame);
                    buffer = buffer.subarray(frameLength);

                    yield this.decode(deframed);
                }

                if (done) {
                    break;
                }
            }

            // Warn if there's leftover data
            if (buffer.length > 0) {
                throw new Error(`Stream ended with ${buffer.length} bytes of incomplete message data`);
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Creates an async generator that reads from a ReadableStream and yields raw deframed buffers.
     * Useful when you want to defer decoding or handle it separately.
     * 
     * @param stream A ReadableStream of Uint8Array chunks
     * @returns An async generator that yields raw deframed buffers
     */
    async *deframeFromReadableStreamRaw(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
        const reader = stream.getReader();
        let buffer: Uint8Array = new Uint8Array(0);

        const appendToBuffer = (chunk: Uint8Array): void => {
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer, 0);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;
        };

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (value) {
                    appendToBuffer(value);
                }

                while (buffer.length > 0) {
                    let frameLength: number;
                    try {
                        frameLength = this.getFramedMessageLength(buffer);
                    } catch {
                        break;
                    }

                    if (frameLength <= 0 || buffer.length < frameLength) {
                        break;
                    }

                    const frame = buffer.subarray(0, frameLength);
                    const deframed = this.deframeBuffer(frame);
                    buffer = buffer.subarray(frameLength);

                    yield deframed;
                }

                if (done) {
                    break;
                }
            }

            if (buffer.length > 0) {
                throw new Error(`Stream ended with ${buffer.length} bytes of incomplete message data`);
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Creates a TransformStream that deframes and decodes messages.
     * Useful for piping streams together.
     * 
     * @returns A TransformStream that takes Uint8Array chunks and outputs decoded messages
     * 
     * @example
     * ```typescript
     * const response = await fetch('/api/messages');
     * const messageStream = response.body!.pipeThrough(manager.createDeframingTransformStream());
     * 
     * for await (const message of messageStream) {
     *     handleMessage(message);
     * }
     * ```
     */
    createDeframingTransformStream(): TransformStream<Uint8Array, TDecodedType> {
        const manager = this;
        let buffer: Uint8Array = new Uint8Array(0);

        return new TransformStream<Uint8Array, TDecodedType>({
            transform(chunk: Uint8Array, controller: TransformStreamDefaultController<TDecodedType>): void {
                // Append chunk to buffer
                const newBuffer = new Uint8Array(buffer.length + chunk.length);
                newBuffer.set(buffer, 0);
                newBuffer.set(chunk, buffer.length);
                buffer = newBuffer;

                // Extract and enqueue all complete messages
                while (buffer.length > 0) {
                    let frameLength: number;
                    try {
                        frameLength = manager.getFramedMessageLength(buffer);
                    } catch {
                        break;
                    }

                    if (frameLength <= 0 || buffer.length < frameLength) {
                        break;
                    }

                    const frame = buffer.subarray(0, frameLength);
                    const deframed = manager.deframeBuffer(frame);
                    buffer = buffer.subarray(frameLength);

                    controller.enqueue(manager.decode(deframed));
                }
            },

            flush(controller: TransformStreamDefaultController<TDecodedType>): void {
                if (buffer.length > 0) {
                    controller.error(new Error(`Stream ended with ${buffer.length} bytes of incomplete message data`));
                }
            }
        });
    }

    /**
     * Creates a TransformStream that encodes and frames messages.
     * Useful for piping decoded messages to a binary stream.
     * 
     * @returns A TransformStream that takes decoded messages and outputs framed Uint8Array chunks
     * 
     * @example
     * ```typescript
     * const encoder = manager.createFramingTransformStream();
     * const writer = encoder.writable.getWriter();
     * 
     * await writer.write({ type: 'hello', data: 'world' });
     * await writer.write({ type: 'ping' });
     * await writer.close();
     * 
     * // Or pipe to a destination
     * const response = encoder.readable.pipeThrough(compressionStream);
     * ```
     */
    createFramingTransformStream(): TransformStream<TDecodedType, Uint8Array> {
        const manager = this;

        return new TransformStream<TDecodedType, Uint8Array>({
            transform(message, controller) {
                const encoded = manager.encode(message);
                const framed = manager.frameBuffer(encoded);
                controller.enqueue(framed);
            }
        });
    }

    /**
     * Creates a WritableStream that encodes, frames, and writes messages to a destination.
     * Useful for sending messages to a network connection or file.
     * 
     * @param destination A WritableStream to write framed binary data to
     * @returns A WritableStream that accepts decoded messages
     * 
     * @example
     * ```typescript
     * // With fetch (streaming request body)
     * const { readable, writable } = new TransformStream<Uint8Array>();
     * const messageWriter = manager.createFramingWritableStream(writable);
     * 
     * fetch('/api/messages', {
     *     method: 'POST',
     *     body: readable,
     *     duplex: 'half'
     * });
     * 
     * const writer = messageWriter.getWriter();
     * await writer.write({ type: 'hello' });
     * await writer.write({ type: 'world' });
     * await writer.close();
     * ```
     */
    createFramingWritableStream(destination: WritableStream<Uint8Array>): WritableStream<TDecodedType> {
        const manager = this;
        const destWriter = destination.getWriter();

        return new WritableStream<TDecodedType>({
            async write(message) {
                const encoded = manager.encode(message);
                const framed = manager.frameBuffer(encoded);
                await destWriter.write(framed);
            },

            async close() {
                await destWriter.close();
            },

            async abort(reason) {
                await destWriter.abort(reason);
            }
        });
    }

    /**
     * Creates a bidirectional stream pair for full-duplex communication.
     * Returns a readable stream for incoming messages and a writable stream for outgoing messages.
     * 
     * @param inputStream A ReadableStream of incoming binary data
     * @param outputStream A WritableStream for outgoing binary data
     * @returns An object with `readable` for incoming decoded messages and `writable` for outgoing messages
     * 
     * @example
     * ```typescript
     * // WebSocket-like usage
     * const { readable, writable } = manager.createBidirectionalStreams(
     *     incomingBinaryStream,
     *     outgoingBinaryStream
     * );
     * 
     * // Send messages
     * const writer = writable.getWriter();
     * await writer.write({ type: 'request', id: 1 });
     * 
     * // Receive messages
     * for await (const message of readable) {
     *     handleMessage(message);
     * }
     * ```
     */
    createBidirectionalStreams(
        inputStream: ReadableStream<Uint8Array>,
        outputStream: WritableStream<Uint8Array>
    ): {
        readable: ReadableStream<TDecodedType>;
        writable: WritableStream<TDecodedType>;
    } {
        return {
            readable: inputStream.pipeThrough(this.createDeframingTransformStream()),
            writable: this.createFramingWritableStream(outputStream)
        };
    }

    /**
     * Pipes an async iterable of messages to a WritableStream, encoding and framing each one.
     * Useful for streaming a sequence of messages to a destination.
     * 
     * @param messages An async iterable of messages to send
     * @param destination A WritableStream to write framed binary data to
     * 
     * @example
     * ```typescript
     * async function* generateMessages() {
     *     yield { type: 'start' };
     *     for (let i = 0; i < 100; i++) {
     *         yield { type: 'data', value: i };
     *     }
     *     yield { type: 'end' };
     * }
     * 
     * await manager.pipeMessagesToStream(generateMessages(), outputStream);
     * ```
     */
    async pipeMessagesToStream(
        messages: AsyncIterable<TDecodedType> | Iterable<TDecodedType>,
        destination: WritableStream<Uint8Array>
    ): Promise<void> {
        const writer = destination.getWriter();

        try {
            for await (const message of messages) {
                const encoded = this.encode(message);
                const framed = this.frameBuffer(encoded);
                await writer.write(framed);
            }
            await writer.close();
        } catch (err) {
            await writer.abort(err);
            throw err;
        }
    }

    /**
     * Creates a ReadableStream from an async iterable of messages.
     * Each message is encoded and framed before being emitted.
     * 
     * @param messages An async iterable of messages
     * @returns A ReadableStream of framed binary data
     * 
     * @example
     * ```typescript
     * async function* generateMessages() {
     *     yield { type: 'hello' };
     *     yield { type: 'world' };
     * }
     * 
     * const stream = manager.createReadableStreamFromMessages(generateMessages());
     * 
     * // Use as fetch body
     * await fetch('/api', { method: 'POST', body: stream, duplex: 'half' });
     * ```
     */
    createReadableStreamFromMessages(
        messages: AsyncIterable<TDecodedType> | Iterable<TDecodedType>
    ): ReadableStream<Uint8Array> {
        const manager = this;
        const isAsync = Symbol.asyncIterator in messages;

        // Create the iterator once, outside the ReadableStream callbacks
        const iterator = isAsync
            ? (messages as AsyncIterable<TDecodedType>)[Symbol.asyncIterator]()
            : (messages as Iterable<TDecodedType>)[Symbol.iterator]();

        return new ReadableStream<Uint8Array>({
            async pull(controller) {
                const result = isAsync
                    ? await (iterator as AsyncIterator<TDecodedType>).next()
                    : (iterator as Iterator<TDecodedType>).next();

                if (result.done) {
                    controller.close();
                    return;
                }

                const encoded = manager.encode(result.value);
                const framed = manager.frameBuffer(encoded);
                controller.enqueue(framed);
            },

            async cancel() {
                if ('return' in iterator && typeof iterator.return === 'function') {
                    const returnResult = iterator.return();
                    // Await if it's a promise (async iterator)
                    if (returnResult instanceof Promise) {
                        await returnResult;
                    }
                }
            }
        });
    }

}
