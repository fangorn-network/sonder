# Schemas

This directory holds a colletion of schemas using in Sond3r and their deployment information.

## Track Invariants

[test.sond3r.track.invariants.1](./TrackInvariantSchema.json)

``` sh
fangorn schema register test.sond3r.track.invariants.1
```
| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0x4717598a3d3995ec7a8e9897d29cda00cb750f6e0e9f52f82aeb16365edc1ab6 |
| CID       | bafkreibbmkbhr5uplqddaqxcvqmxszi4mqffbdw6r6yh37tfnqquyqr7uy        |


OFFICIAL

[sond3r.track.invariants.0](./TrackInvariantSchema.json)

``` sh
fangorn schema register sond3r.track.invariants.0
```
| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0x4717598a3d3995ec7a8e9897d29cda00cb750f6e0e9f52f82aeb16365edc1ab6 |
| CID       | bafkreibbmkbhr5uplqddaqxcvqmxszi4mqffbdw6r6yh37tfnqquyqr7uy        |


## Track Taxonomy 

[test.sond3r.track.taxonomy.0](./TrackTaxonomySchema.json)

``` sh
fangorn schema register test.sond3r.track.taxonomy.0
```

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0xa29392f3d443285ffd2e3b03f4d966fb47dac4f8a1691c3c5eb91859ec1f7f7a |
| CID       | bafkreifdl45cicaub6iiozhme35lmcppbvvdkjmndcp7kv4qwhbgvziwzm        |


## Track Audio Source 

test.sond3r.track.source.0
``` sh
fangorn schema register test.sond3r.track.source.0
```

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0x052f754de156c31a8ef35e3a50a1eae452dd79abb3f32a76a4663ab182f261da |
| CID       | bafkreigxkdfjh4akkijmdfue5rqhfwtyr5eueyxwf7yl3bqvmsfkidoxme        |

   Publishing
<--- Last few GCs --->

[458717:0x2e206000]    45671 ms: Mark-Compact 4040.3 (4128.1) -> 4033.6 (4137.6) MB, pooled: 0 MB, 1095.63 / 0.00 ms  (average mu = 0.602, current mu = 0.325) allocation failure; scavenge might not succeed
[458717:0x2e206000]    47610 ms: Mark-Compact 4049.8 (4137.9) -> 4041.0 (4144.9) MB, pooled: 0 MB, 1880.10 / 0.00 ms  (average mu = 0.354, current mu = 0.030) allocation failure; scavenge might not succeed


<--- JS stacktrace --->

FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0xe40d2e node::OOMErrorHandler(char const*, v8::OOMDetails const&) [node]
 2: 0x12167b0 v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [node]
 3: 0x1216a87 v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [node]
 4: 0x1444365  [node]
 5: 0x145dbf9 v8::internal::Heap::CollectGarbage(v8::internal::AllocationSpace, v8::internal::GarbageCollectionReason, v8::GCCallbackFlags) [node]
 6: 0x14322a8 v8::internal::HeapAllocator::AllocateRawWithLightRetrySlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [node]
 7: 0x14331d5 v8::internal::HeapAllocator::AllocateRawWithRetryOrFailSlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [node]
 8: 0x140beae v8::internal::Factory::NewFillerObject(int, v8::internal::AllocationAlignment, v8::internal::AllocationType, v8::internal::AllocationOrigin) [node]
 9: 0x186d50c v8::internal::Runtime_AllocateInYoungGeneration(int, unsigned long*, v8::internal::Isolate*) [node]
10: 0x7a0cb7eac476 
Aborted (core dumped)
(venv) driemworks@DESKTOP-RN9BJOQ:~/fangorn/fangorn-music/test_data$ 