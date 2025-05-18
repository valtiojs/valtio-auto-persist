import { defineConfig } from "vite"

export default defineConfig({
	test: {
		environment: "jsdom",
		benchmark: {
			include: ["./bench/**"], // Adjust if needed
			reporters: ["verbose"],
		},
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			enabled: true,
		},
	},
})
