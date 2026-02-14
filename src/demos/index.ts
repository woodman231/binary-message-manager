import { doNetworkSimulationDemo } from "./networkSimulationDemo.js";
import { doHTTPDemo } from "./httpDemo.js";
import { doLowHighWaterMarkDemo } from "./fileStreamWithLowHighWaterMarkDemo.js";

async function main() {
    console.log("Starting message manager demo...\n");

    await doNetworkSimulationDemo();
    await doHTTPDemo();
    await doLowHighWaterMarkDemo();

    console.log("Demo complete.");
}

main().catch(console.error);
