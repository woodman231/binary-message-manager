import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { unlink } from "node:fs/promises";
import { StringBinaryMessageManager } from "./StringBinaryMessageManager.js";

export async function doLowHighWaterMarkDemo() {
    console.log("Starting low highWaterMark demo...");
    console.log("This demonstrates handling of incomplete chunks.\n");

    const manager = new StringBinaryMessageManager();
    const fileName = "chunked_messages.bin";

    // Messages of varying lengths to make chunking more interesting
    const messages = [
        "Hi",
        "Hello, World!",
        "This is a longer message to test chunking behavior",
        "Short",
        "Another medium-length message here",
        "X" // Very short
    ];

    // Show what we're encoding
    console.log("Messages to encode:");
    for (const msg of messages) {
        const encoded = manager.encode(msg);
        const framed = manager.frameBuffer(encoded);
        console.log(`  "${msg}" -> ${encoded.length} bytes encoded, ${framed.length} bytes framed`);
    }

    // Write all messages to file
    const allFramed = manager.encodeAndFrameManyMessages(messages);
    console.log(`\nTotal buffer size: ${allFramed.length} bytes`);
    console.log("Writing to file...\n");

    const writeStream = createWriteStream(fileName);
    await new Promise<void>((resolve, reject) => {
        writeStream.write(allFramed, (err) => {
            if (err) reject(err);
            else {
                writeStream.end();
                resolve();
            }
        });
    });

    // Read back with very low highWaterMark (8 bytes)
    // This forces the stream to deliver tiny chunks
    const highWaterMark = 8;
    console.log(`Reading file with highWaterMark=${highWaterMark} bytes...`);
    console.log("This will split messages across multiple chunks.\n");

    const readStream = createReadStream(fileName, { highWaterMark });

    // Log each raw chunk to show the splitting
    let chunkIndex = 0;
    readStream.on("data", (chunk: Buffer) => {
        const bytes = Array.from(chunk).map(b => b.toString(16).padStart(2, "0")).join(" ");
        console.log(`  Chunk ${chunkIndex++}: ${chunk.length} bytes [${bytes}]`);
    });

    // Convert to web stream and use our deframer
    const webStream = Readable.toWeb(readStream) as ReadableStream<Uint8Array>;

    console.log("\nDecoded messages:");
    const decoded: string[] = [];
    for await (const message of manager.deframeFromReadableStream(webStream)) {
        console.log(`  -> "${message}"`);
        decoded.push(message);
    }

    // Verify correctness
    console.log("\n--- Verification ---");
    console.log(`Original count: ${messages.length}, Decoded count: ${decoded.length}`);
    const allMatch = messages.every((msg, i) => msg === decoded[i]);
    console.log(`All messages match: ${allMatch ? "✅ YES" : "❌ NO"}`);

    if (!allMatch) {
        console.log("\nMismatch details:");
        messages.forEach((msg, i) => {
            const match = msg === decoded[i];
            console.log(`  [${i}] ${match ? "✅" : "❌"} "${msg}" vs "${decoded[i]}"`);
        });
    }

    // Cleanup
    await unlink(fileName);
    console.log(`\nCleaned up ${fileName}`);
    console.log("Low highWaterMark demo complete.\n");
}