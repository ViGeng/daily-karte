export default [{
  ignores: ['node_modules/**'],
}, {
  files: ['dist/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: Object.fromEntries([
      'window', 'document', 'location', 'history', 'localStorage', 'CSS',
      'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'URL', 'Blob', 'Event',
    ].map(name => [name, 'readonly'])),
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'no-duplicate-imports': 'error',
    'valid-typeof': 'error',
    'eqeqeq': 'error',
  },
}, {
  files: ['tests/**/*.mjs', 'scripts/**/*.mjs'],
  languageOptions: { globals: { process: 'readonly' } },
}];
