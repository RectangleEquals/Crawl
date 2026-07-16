/**
 * Area composer (Docs/07) — cyclic room-graph + socket-based modular stitching
 * that turns a region into a multi-room, varied, loopable area. Registry-driven
 * (rooms/connectors/biomes) so variety grows without touching the core; data
 * models are Z-ready (sockets carry height + traversal + gate).
 */

export * from "./sockets.js";
export * from "./rooms.js";
export * from "./connectors.js";
export * from "./layout.js";
export * from "./emit.js";
export * from "./compose.js";
