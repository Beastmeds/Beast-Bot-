const path = require('path');
const { parseStringPromise } = require('xml2js');
const fetch = require('node-fetch');
const { limit } = require('../function');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../config.env') });
const gelbooruApiKey = (process.env.GELBOORU_API_KEY === '' || process.env.GELBOORU_API_KEY === 'api-key') ? '' : process.env.GELBOORU_API_KEY || '';
const gelbooruUserId = (process.env.GELBOORU_USER_ID === '' || process.env.GELBOORU_USER_ID === 'api-key') ? '' : process.env.GELBOORU_USER_ID || '';

const extractImageData = (xmlData) => {
    const posts = xmlData.posts.post;
    const images = posts.map(post => ({
        file_url: post.$.file_url,
        id: post.$.id
    }));
    return images;
};

const parseXmlResponse = async (xmlData) => {
    try {
        return await parseStringPromise(xmlData);
    } catch (error) {
        console.error('Error parsing XML:', error);
        throw new Error('An error occurred while parsing XML response.');
    }
};

const gelbooru = (tags) => {
    const apiUrl = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${tags}&api_key=${gelbooruApiKey}&user_id=${gelbooruUserId}`;
    return fetch(apiUrl)
        .then(response => response.json())
        .catch(error => {
            console.error('Error fetching data from Gelbooru:', error);
            throw new Error('An error occurred while fetching file from Gelbooru.');
        });
};

const rule34 = async (rtags) => {
    try {
        const apiUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&limit=100&pid=0&tags=${rtags}`;
        const response = await fetch(apiUrl);
        const xmlData = await response.text();
        const parsedData = await parseXmlResponse(xmlData);
        const images = extractImageData(parsedData);
        if (images.length === 0) {
            throw new Error('No files found for the specified tags.');
        }
        return images;
    } catch (error) {
        console.error('Error fetching file from Rule34:', error);
        throw new Error('An error occurred while fetching file from Rule34.');
    }
};

const kemono = async (query, tags = []) => {
    let apiUrl = 'https://kemono.su/api/v1/posts?limit=50';
    if (query || tags.length) {
        const tagsQuery = tags.length ? `&tags=${tags.join('+')}` : '';
        apiUrl += `&q=${encodeURIComponent(query || '')}${tagsQuery}`;
    }
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.posts)) {
        throw new Error('Invalid API response: posts array not found');
    }
    return data.posts;
};

const coomer = async (query, tags = []) => {
    let apiUrl = 'https://coomer.su/api/v1/posts?limit=50';
    if (query || tags.length) {
        const tagsQuery = tags.length ? `&tags=${tags.join('+')}` : '';
        apiUrl += `&q=${encodeURIComponent(query || '')}${tagsQuery}`;
    }
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.posts)) {
        throw new Error('Invalid API response: posts array not found');
    }
    return data.posts;
};

async function gelbooruCommand(ShadowBot, lang, tags, from, sender, id, _limit, isPremium, isOwner) {
    try {
        const result = await gelbooru(tags);
        if (!result.post || result.post.length === 0) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const shuffledPosts = result.post.sort(() => Math.random() - 0.5);
        let selectedPost = null;
        for (const post of shuffledPosts) {
            const imageUrl = post.file_url;
            if (imageUrl.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
                if (imageResponse.ok) {
                    const imageSize = parseInt(imageResponse.headers.get('content-length'), 10);
                    if (imageSize && imageSize <= 67108864) {
                        selectedPost = post;
                        break;
                    }
                }
            }
        }
        if (!selectedPost) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const imageUrl = selectedPost.file_url;
        const postUrl = `https://gelbooru.com/index.php?page=post&s=view&id=${selectedPost.id}`;
        await ShadowBot.sendFileFromUrl(from, imageUrl, 'file', postUrl, id);
        limit.addLimit(sender.id, _limit, isPremium, isOwner);
    } catch (error) {
        console.error(error);
        await ShadowBot.reply(from, lang.error(), id);
    }
}

async function rule34Command(ShadowBot, lang, tags, from, sender, id, _limit, isPremium, isOwner) {
    try {
        const images = await rule34(tags);
        if (!images || images.length === 0) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const shuffledImages = images.sort(() => Math.random() - 0.5);
        let selectedImage = null;
        for (const image of shuffledImages) {
            const imageUrl = image.file_url;
            if (imageUrl.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
                if (imageResponse.ok) {
                    const imageSize = parseInt(imageResponse.headers.get('content-length'), 10);
                    if (imageSize && imageSize <= 67108864) {
                        selectedImage = image;
                        break;
                    }
                }
            }
        }
        if (!selectedImage) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const imageUrl = selectedImage.file_url;
        const postUrl = `https://rule34.xxx/index.php?page=post&s=view&id=${selectedImage.id}`;
        await ShadowBot.sendFileFromUrl(from, imageUrl, 'file', postUrl, id);
        limit.addLimit(sender.id, _limit, isPremium, isOwner);
    } catch (error) {
        console.error(error);
        await ShadowBot.reply(from, lang.error(), id);
    }
}

async function kemonoCommand(ShadowBot, lang, query, tags, from, sender, id, _limit, isPremium, isOwner) {
    try {
        const posts = await kemono(query, tags);
        if (!posts.length) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const shuffledPosts = posts.sort(() => Math.random() - 0.5);
        let media = null;
        let selectedPost = null;
        for (const post of shuffledPosts) {
            if (post.file?.path?.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                const mediaUrl = `https://kemono.su${post.file.path}`;
                const mediaResponse = await fetch(mediaUrl, { method: 'HEAD' });
                if (mediaResponse.ok) {
                    const mediaSize = parseInt(mediaResponse.headers.get('content-length'), 10);
                    if (mediaSize && mediaSize <= 67108864) {
                        media = post.file;
                        selectedPost = post;
                        break;
                    }
                }
            } else if (Array.isArray(post.attachments)) {
                for (const attachment of post.attachments) {
                    if (attachment.path?.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                        const mediaUrl = `https://kemono.su${attachment.path}`;
                        const mediaResponse = await fetch(mediaUrl, { method: 'HEAD' });
                        if (mediaResponse.ok) {
                            const mediaSize = parseInt(mediaResponse.headers.get('content-length'), 10);
                            if (mediaSize && mediaSize <= 67108864) {
                                media = attachment;
                                selectedPost = post;
                                break;
                            }
                        }
                    }
                }
                if (media) break;
            }
        }
        if (!media || !selectedPost) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const mediaUrl = `https://kemono.su${media.path}`;
        const postUrl = `https://kemono.su/${selectedPost.service}/user/${selectedPost.user}/post/${selectedPost.id}`;
        await ShadowBot.sendFileFromUrl(from, mediaUrl, 'file', postUrl, id);
        limit.addLimit(sender.id, _limit, isPremium, isOwner);
    } catch (error) {
        console.error(error);
        await ShadowBot.reply(from, lang.error(), id);
    }
}

async function coomerCommand(ShadowBot, lang, query, tags, from, sender, id, _limit, isPremium, isOwner) {
    try {
        const posts = await coomer(query, tags);
        if (!posts.length) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const shuffledPosts = posts.sort(() => Math.random() - 0.5);
        let media = null;
        let selectedPost = null;
        for (const post of shuffledPosts) {
            if (post.file?.path?.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                const mediaUrl = `https://coomer.su${post.file.path}`;
                const mediaResponse = await fetch(mediaUrl, { method: 'HEAD' });
                if (mediaResponse.ok) {
                    const mediaSize = parseInt(mediaResponse.headers.get('content-length'), 10);
                    if (mediaSize && mediaSize <= 67108864) {
                        media = post.file;
                        selectedPost = post;
                        break;
                    }
                }
            } else if (Array.isArray(post.attachments)) {
                for (const attachment of post.attachments) {
                    if (attachment.path?.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
                        const mediaUrl = `https://coomer.su${attachment.path}`;
                        const mediaResponse = await fetch(mediaUrl, { method: 'HEAD' });
                        if (mediaResponse.ok) {
                            const mediaSize = parseInt(mediaResponse.headers.get('content-length'), 10);
                            if (mediaSize && mediaSize <= 67108864) {
                                media = attachment;
                                selectedPost = post;
                                break;
                            }
                        }
                    }
                }
                if (media) break;
            }
        }
        if (!media || !selectedPost) {
            await ShadowBot.reply(from, lang.notFoundTags(), id);
            return;
        }
        const mediaUrl = `https://coomer.su${media.path}`;
        const postUrl = `https://coomer.su/${selectedPost.service}/user/${selectedPost.user}/post/${selectedPost.id}`;
        await ShadowBot.sendFileFromUrl(from, mediaUrl, 'file', postUrl, id);
        limit.addLimit(sender.id, _limit, isPremium, isOwner);
    } catch (error) {
        console.error(error);
        await ShadowBot.reply(from, lang.error(), id);
    }
}

module.exports = {
    gelbooru,
    rule34,
    kemono,
    coomer,
    gelbooruCommand,
    rule34Command,
    kemonoCommand,
    coomerCommand
};