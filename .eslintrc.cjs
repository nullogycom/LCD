module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020
	},
	env: {
		browser: false,
		es2017: true,
		node: true
	},
	rules: {
		'@typescript-eslint/no-explicit-any': 'warn'
	}
}
