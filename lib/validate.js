function validateUsers(mentionedJidList, args, botNumber, lang, allowMultiple = true) {
    let targetUsers = [];
    if (mentionedJidList.length > 0) {
        targetUsers = mentionedJidList.filter(user => user !== botNumber);
        if (targetUsers.length === 0) return lang.wrongFormat();
        if (!allowMultiple && targetUsers.length > 1) return lang.tooManyMentions();
    } else if (args.length > 0) {
        for (const arg of args) {
            const userId = arg.startsWith('@') ? arg.replace('@', '') + '@c.us' : arg + '@c.us';
            if (!userId.match(/^\d+@c.us$/)) return lang.invalidUser();
            if (userId === botNumber) return lang.wrongFormat();
            targetUsers.push(userId);
        }
    } else {
        return lang.wrongFormat();
    }
    return targetUsers;
}

module.exports = {
    validateUsers
};
