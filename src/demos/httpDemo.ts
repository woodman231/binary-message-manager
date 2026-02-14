import http from "http";
import { StringBinaryMessageManager } from "./StringBinaryMessageManager.js";
import { Readable, Writable } from "stream";

export async function doHTTPDemo() {
    console.log("Starting HTTP demo...");

    const server = http.createServer(async (req, res) => {
        if (req.method === "POST") {
            const serverManager = new StringBinaryMessageManager();

            console.log("Server: Received POST request");
            res.writeHead(200, { "Content-Type": "application/octet-stream" });

            const inputWebStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;

            // Create a transform that processes each message
            const processingTransform = new TransformStream<string, string>({
                async transform(message, controller) {
                    console.log("Server processing:", message);

                    // Simulate async work (database lookup, computation, etc.)
                    await new Promise(resolve => setTimeout(resolve, 100));

                    controller.enqueue(`Echo: ${message}`);
                }
            });

            // Chain: binary -> deframe -> process -> frame -> binary
            const processedStream = inputWebStream
                .pipeThrough(serverManager.createDeframingTransformStream())
                .pipeThrough(processingTransform)
                .pipeThrough(serverManager.createFramingTransformStream());

            // Write processed output to response
            const writer = Writable.toWeb(res);
            await processedStream.pipeTo(writer);

            console.log("Server: Finished processing all messages");
        } else {
            res.writeHead(405);
            res.end();
        }
    });

    await new Promise<void>(resolve => server.listen(3000, resolve));
    console.log("HTTP server listening on port 3000");

    const messagesToSend = ["Hello, HTTP Server!", "Second message", "Third message"];
    console.log("Client: Sending messages:", messagesToSend);

    const clientManager = new StringBinaryMessageManager();
    const requestBody = clientManager.encodeAndFrameManyMessages(messagesToSend);

    const response = await fetch("http://localhost:3000", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },        
        body: Readable.toWeb(Readable.from(requestBody)) as ReadableStream<Uint8Array>
    });

    if (response.ok) {
        for await (const message of clientManager.deframeFromReadableStream(response.body!)) {
            console.log("Client received:", message);
        }
    } else {
        console.error("HTTP request failed with status:", response.status);
    }

    await new Promise<void>(resolve => server.close(() => resolve()));
    console.log("HTTP server closed");
    console.log("HTTP demo complete.\n");
}
