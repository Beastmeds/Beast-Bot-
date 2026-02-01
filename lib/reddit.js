const fetch = require('node-fetch');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const { media, serial } = require('../lib');
const { limit } = require('../function');

async function fetchRedditPost(ShadowBot, lang, args, from, sender, id, _limit, isPremium, isOwner) {
    const ignoredSubreddits = fs.readFileSync('./reddit/reddit-ignore.txt', 'utf8')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    let nsfwSubreddits = fs.readFileSync('./reddit/reddit.txt', 'utf8')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && !ignoredSubreddits.includes(s));
    let subreddit = args[0] || 'random';
    if (subreddit !== 'random' && ignoredSubreddits.includes(subreddit)) {
        return await ShadowBot.reply(from, lang.subredditIgnored(subreddit), id);
    }
    if (subreddit === 'random') {
        if (nsfwSubreddits.length === 0) {
            return await ShadowBot.reply(from, lang.noSubredditsAvailable(), id);
        }
        subreddit = nsfwSubreddits[Math.floor(Math.random() * nsfwSubreddits.length)];
    }
    try {
        const redditUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=100`;
        const res = await fetch(redditUrl);
        if (res.status === 429) {
            return await ShadowBot.reply(from, lang.rateLimit(), id);
        }
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const json = await res.json();
        if (!json || !json.data || json.data.children.length === 0) {
            return await ShadowBot.reply(from, lang.noSubredditFound(), id);
        }
        const posts = json.data.children.filter(post => 
            post.data.post_hint === 'image' ||
            post.data.post_hint === 'hosted:video' ||
            post.data.post_hint === 'rich:video'
        );
        if (posts.length === 0) {
            return await ShadowBot.reply(from, lang.noSubredditFound(), id);
        }
        const shuffledPosts = posts.sort(() => Math.random() - 0.5);
        let selectedPost = null;
        let mediaUrl = null;
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'];
        for (const post of shuffledPosts) {
            let url = post.data.url;
            if (post.data.post_hint === 'hosted:video' && post.data.media?.reddit_video?.fallback_url) {
                url = post.data.media.reddit_video.fallback_url;
            }
            if (url && validExtensions.some(ext => url.endsWith(ext)) && !url.endsWith('.html')) {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) {
                    const size = parseInt(response.headers.get('content-length'), 10);
                    if (size && size <= 67108864) {
                        selectedPost = post.data;
                        mediaUrl = url;
                        break;
                    }
                }
            }
        }
        if (!selectedPost || !mediaUrl) {
            return await ShadowBot.reply(from, lang.noSubredditFound(), id);
        }
        if (mediaUrl.endsWith('.gif')) {
            const redditSerial = serial.serial();
            const tempInput = `./temp/reddit_${redditSerial}.gif`;
            const tempOutput = `./temp/reddit_${redditSerial}_converted.mp4`;
            try {
                await new Promise((resolve, reject) => {
                    const file = fs.createWriteStream(tempInput);
                    const request = mediaUrl.startsWith('https') ? https.get : http.get;
                    request(mediaUrl, (response) => {
                        if (response.statusCode !== 200) {
                            return reject(new Error(`HTTP error: ${response.statusCode}`));
                        }
                        response.pipe(file);
                        file.on('finish', () => file.close(resolve));
                    }).on('error', (error) => {
                        fs.unlink(tempInput, () => reject(error));
                    });
                });
                await media.convertGifToMp4(tempInput, tempOutput);
                await ShadowBot.sendFile(from, tempOutput, 'file', `r/${subreddit}\n\n${selectedPost.title}`, id);
                limit.addLimit(sender.id, _limit, isPremium, isOwner);
            } finally {
                await fs.unlink(tempInput);
                await fs.unlink(tempOutput);
            }
        } else {
            await ShadowBot.sendFileFromUrl(from, mediaUrl, 'file', `r/${subreddit}\n\n${selectedPost.title}`, id);
            limit.addLimit(sender.id, _limit, isPremium, isOwner);
        }
    } catch (error) {
        await ShadowBot.reply(from, lang.error(), id);
    }
}

module.exports = {
    fetchRedditPost
};