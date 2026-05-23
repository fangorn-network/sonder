# scripts/download-ytdlp.sh
#!/bin/bash
mkdir -p resources/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o resources/bin/linux/yt-dlp
chmod +x resources/bin/linux/yt-dlp
echo "yt-dlp downloaded"

curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe \
  -o resources/bin/win/yt-dlp.exe
echo "yt-dlp.exe downloaded"
which ffmpeg || sudo apt install ffmpeg -y
