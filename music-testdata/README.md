# Internet Archive

ia search "collection:lemon-tunes" --itemlist > lemon-tunes-items.txt

// limit by number of items
head -n 10 lemon-tunes-items.txt > lemon-tunes-sample.txt
ia download --itemlist lemon-tunes-sample.txt --destdir ./ia-data --format="VBR MP3"

https://freemusicarchive.org/

https://soundcloud.com/freemusicarchive

https://citizen-dj.labs.loc.gov/loc-fma/use/