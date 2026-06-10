# Schemas

This directory holds a colletion of schemas using in Sond3r and their deployment information.

## Track Invariants

[TrackInvariants](./TrackInvariantSchema.json)

``` sh
fangorn schema register test.sond3r.track.invariants.2
```
| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0xe3c81df02f63c4e1a39d7e451de1826da385b146152d516cc4951da49c779527 |
| CID       | bafkreic6l2plefzlotdm5pcvd6qtgrcxrhr5lkhkgqheqt4ozlw2iqjilq        |


151k tracks compressed to 151 pins!! woohoo! it works!!

fangorn schema register test.sond3r.track.invariants.3

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0xc4103f242a1e99bda3d6c484aa4e8155fc7e2df8fa6f59e0362a592b91570143 |
| CID       | bafkreifg6ix5hc2f2266y73zpzzk2vbxjiytef7yaw4425kpjoog53fwwu        |

fangorn schema register test.sond3r.track.taxonomy.2

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0x382fdaf1fb03f43ee0e5bcb0517fe0d2df3a3e9d27dddedf371c67e4812b6720 |
| CID       | bafkreia66sj5w6wbtfsvqpkb2lmdnbxlvjzaqycmdxvesvoqo4k3kpro2y        |

fangorn publish upload ./stage_volumes/volume_1_core.json -s test.sond3r.track.invariants.3 -d mbdump-652026-core
fangorn publish upload ./stage_volumes/volume_1_taxonomy.json -s test.sond3r.track.taxonomy.2 -d mbdump-652026-taxonomy

## Track Taxonomy 

[Taxonomies](./TrackTaxonomySchema.json)

``` sh
fangorn schema register test.sond3r.track.taxonomy.1
```

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0xccf6667bef466ee1aafe8a4dbc62f8c174a00fdefb5f99416d97a3f1b8d132f0 |
| CID       | bafkreihisf67fbfehhqn2gk2qnzhciloaevgb45yxjmgrx6362tib53xvi        |


## Track Audio Source 

needed??

test.sond3r.track.source.0
``` sh
fangorn schema register test.sond3r.track.source.0
```

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| Schema Id | 0x052f754de156c31a8ef35e3a50a1eae452dd79abb3f32a76a4663ab182f261da |
| CID       | bafkreigxkdfjh4akkijmdfue5rqhfwtyr5eueyxwf7yl3bqvmsfkidoxme        |

 
