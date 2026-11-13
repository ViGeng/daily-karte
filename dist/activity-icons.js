export const activityIcons = ['sun', 'utensils', 'moon', 'coffee', 'book', 'dumbbell', 'languages', 'users', 'leaf', 'sparkles'];
/** @param {unknown} value @returns {value is string} */
export function isActivityIcon(value) {
    return typeof value === 'string' && (activityIcons.includes(value)
        || /^emoji:[^<>\s\u0000-\u001f\u007f]{1,32}$/u.test(value));
}
