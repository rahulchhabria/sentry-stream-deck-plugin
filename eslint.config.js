import { config } from "@elgato/eslint-config";

export default [
	{
		ignores: [
			"**/bin/**",
			"**/sdpi-components.js"
		]
	},
	...config.recommended
];
