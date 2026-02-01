const fetch = require('node-fetch');

const waifu = (nsfw) => new Promise((resolve, reject) => {
    const url = nsfw ? 'https://waifu.pics/api/nsfw/waifu' : 'https://waifu.pics/api/sfw/waifu';
    console.log(`${nsfw ? 'NSFW' : 'SFW'} waifu image...`);

    fetch(url)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch(err => reject(err));
});

const waifuPics = (category = 'waifu', nsfw = false) => new Promise((resolve, reject) => {
    const type = nsfw ? 'nsfw' : 'sfw';
    const url = `https://waifu.pics/api/${type}/${category}`;
    console.log(`Fetching ${type.toUpperCase()} image from category: ${category}`);

    fetch(url)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch((err) => reject(err));
});

const waifuIm = (tag = 'waifu', nsfw = false) => new Promise((resolve, reject) => {
    const apiUrl = 'https://api.waifu.im/search';
    const params = {
        included_tags: [tag],
        is_nsfw: nsfw ? 'true' : 'false'
    };

    const queryParams = new URLSearchParams();
    for (const key in params) {
        if (Array.isArray(params[key])) {
            params[key].forEach(value => queryParams.append(key, value));
        } else {
            queryParams.set(key, params[key]);
        }
    }

    const url = `${apiUrl}?${queryParams.toString()}`;
    console.log(`Fetching ${nsfw ? 'NSFW' : 'SFW'} image from waifu.im with tag: ${tag}`);

    fetch(url)
        .then(response => response.json())
        .then(result => {
            if (result && result.images && result.images.length > 0) {
                resolve(result.images[0]);
            } else {
                reject('No image found!');
            }
        })
        .catch((err) => reject(err));
});

module.exports = {
    waifu,
    waifuPics,
    waifuIm
};
