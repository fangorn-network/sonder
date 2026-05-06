# Internet Archive

- lemon-tunes
- netlabels

``` sh
ia search "collection:netlabels" --itemlist > netlabels-items.txt
# or filter it
ia search 'collection:netlabels AND mediatype:audio AND (language:English OR language:Spanish)' --itemlist > netlabels-items.txt
# limit by number of items
head -n 50 netlabels-items.txt > netlabels-sample.txt
# or randomly choose some
shuf -n 50 netlabels-items.txt > netlabels-sample.txt

ia download --itemlist netlabels-sample.txt --destdir ./ia-data --format="VBR MP3"
```

https://freemusicarchive.org/

https://soundcloud.com/freemusicarchive

https://citizen-dj.labs.loc.gov/loc-fma/use/

https://chartmasters.org/most-streamed-artists-ever-on-spotify/


There is a standardized genre-set available at
https://eyed3.readthedocs.io/en/latest/plugins/genres_plugin.html