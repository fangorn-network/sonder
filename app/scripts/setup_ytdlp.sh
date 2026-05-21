# scripts/download-ytdlp.sh
#!/bin/bash
mkdir -p resources/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o resources/bin/yt-dlp
chmod +x resources/bin/yt-dlp
echo "yt-dlp downloaded"
which ffmpeg || sudo apt install ffmpeg -y
