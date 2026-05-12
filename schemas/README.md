
track invariants schema

tony.test.invariants.track.2
0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6
bafkreifgzp7kz6n3veprcr26ncye6xrvfzyaa6o4wdgw6gvxkqu4ukdubq

---


I'm looking at the music recording schema and trying to best understand how to break schemas up/standardize them. So I'm thinking for the 'core' schema it should only represent the invarants of the track e.g. the name, artist, year, producer, and so on. Then we can have a new schema for storing genre/mood/context/theme, and finally additional schemas for pointing to each external 'location' where the data can be fetrched. Each of these will carry their own access rules (e.g. must subscribe to spotify premium), some might just need a direct micropayment, etc. So I wonder how to best use standardized fields to capture information, make this run smoothly, and son on. 

https://schema.org/MusicRecording

These fields could be useful for the external version of the schema?

- accountablePerson 	Person 	Specifies the Person that is legally accountable for the CreativeWork.
- acquireLicensePage 	CreativeWork  or
URL 	Indicates a page documenting how licenses can be purchased or otherwise acquired, for the current


and I'm thinking of starting with something like this for the invariant one

{
    "isrCode": {
        "@type": "string | null"
    },
    "title": {
        "@type": "string"
    },
    "byArtist": {
        "@type": "string"
    },
    "year": {
        "@type": "number"
    },
    "about": {
        "@type": "string"
    },
    "schemaVersion": {
        "@type": "number"
    }
}



    "copyright": {
        "@type": "object",
        "items": {
            "holder": {
                "@type": "string | null"
            },
            "year": {
                "@type": "string | null"
            },
            "notice": {
                "@type": "string | null"
            }
        }
    }

Maybe this could be enhanced withg producer,  copyrightHolder 	Organization  or
Person 	The party holding the legal copyright to the CreativeWork.
copyrightNotice 	Text 	Text of a notice appropriate for describing the copyright aspects of this Creative Work, ideally indicating the owner of the copyright for the Work.
copyrightYear 	Number 	The year during which the claimed copyright for the CreativeWork was first asserted. 

And surely there are more tags in the musicrecording schema I haven't considered

---

I would also want to be able to capture ratings and such,