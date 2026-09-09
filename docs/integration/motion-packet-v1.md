# Public MotionPacket V1

This branch defines a deliberately small, public-only binary representation for
sharing a Reel motion preview. It is not a storage format for raw landmarks,
uncertainty, covariance, masks, capture evidence, or private profile data.

## Wire format

All integers are little-endian. A packet is exactly **7,513 bytes**:

- 24-byte header: `HHMP` magic, version `1`, header length, shooting-hand code,
  public boundary code, canonical joint/anchor/frame counts, quantisation
  denominators, payload length, and zeroed reserved bytes.
- Five canonical phase anchors (`ready`, `deepestDip`, `rise`, `releaseProxy`,
  `followThrough`) encoded as an index and uint16 phase.
- 101 dense samples from phase 0 through 1. Each sample stores a uint16 phase and
  12 joints × three signed int16 coordinates.

Coordinates use `1 / 4096` shoulder-breadth units. The public joint order is the
12 persisted joints exported by the shooting-profile codec. Decoder input must
have the exact length, header values, canonical phases, dense arrays, and no
unknown fields; malformed or private-looking data is rejected.

`buildMotionPacketV1` accepts only the validated representative phase-fused 4D
profile and a left/right shooting hand. It projects the public joint coordinates
and canonical metadata, dropping all private evidence and quality fields.

The encoder/decoder pair is deterministic and covered by round-trip, truncation,
header mutation, strict-key, privacy, and representative-profile visual-error
tests in `tests/motion-packet-v1.test.ts`.
