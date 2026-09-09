# Public MotionPacket V1 codec

MotionPacket V1 is the public, non-sensitive motion interchange format for Hoop Hub. It carries a canonical shooting-hand label and representative phase-fused pose coordinates; it does not carry capture evidence, uncertainty, covariance, timestamps, or other private diagnostics.

## Binary layout

All integers are little-endian. The packet is exactly 7,513 bytes:

- Header: 24 bytes. Magic `HHMP`, version `1`, header length `24`, shooting hand (`0` left / `1` right), public boundary code `1`, 12 joints, 101 frames, 5 anchors, coordinate denominator `4096`, phase denominator `65535`, payload length, and reserved zero fields.
- Anchors: five records (`ready`, `deepestDip`, `rise`, `releaseProxy`, `followThrough`), each with a canonical kind and phase.
- Frames: 101 records on the normalized `0..1` phase grid. Each has a uint16 phase followed by 12 joints in the canonical persisted order. Every xyz coordinate is an int16 divided by 4096.

The decoder rejects any wrong magic/version/count/metadata, non-canonical phase or anchor, reserved non-zero field, truncation, trailing byte, or invalid shooting-hand code. Encoding validates the same canonical shape and rejects unsupported fields, non-finite values, and coordinates outside int16 range.

`encodeMotionPacketV1` is deterministic. `decodeMotionPacketV1` returns only the public `MotionPacketV1` shape. `buildMotionPacketV1` validates a private `RepresentativePose4DV2` source and projects only its public joints and canonical metadata.
