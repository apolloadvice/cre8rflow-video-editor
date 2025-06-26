import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				cre8r: {
					dark: '#171717',
					violet: '#7F7FD5',
					'violet-light': '#9B8FE8',
					'violet-dark': '#6B5FC7',
					'violet-gradient-start': '#7F7FD5',
					'violet-gradient-end': '#9B8FE8',
					'gray-800': '#1E1E1E',
					'gray-700': '#2D2D2D',
					'gray-600': '#3D3D3D',
					'gray-500': '#5C5C5C',
					'gray-400': '#7B7B7B',
					'gray-300': '#A0A0A0',
					'gray-200': '#C8C8C8',
					'gray-100': '#E5E5E5',
				}
			},
			backgroundImage: {
				'gradient-violet': 'linear-gradient(135deg, #7F7FD5 0%, #9B8FE8 100%)',
				'gradient-violet-hover': 'linear-gradient(135deg, #8A8ADA 0%, #A69BEB 100%)',
				'editor-panel': 'linear-gradient(145deg, rgba(127, 127, 213, 0.4) 0%, rgba(63, 63, 173, 0.3) 25%, rgba(34, 34, 34, 0.95) 50%, rgba(127, 127, 213, 0.2) 100%)',
				'timeline-marker': 'linear-gradient(to bottom, #7F7FD5 0%, #8F8FDF 50%, #7F7FD5 100%)',
				'quick-action-btn': 'linear-gradient(135deg, rgba(45, 45, 45, 0.9) 0%, rgba(111, 111, 203, 0.3) 50%, rgba(63, 63, 173, 0.4) 100%)',
				'nav-item': 'linear-gradient(90deg, transparent 0%, rgba(127, 127, 213, 0.05) 50%, rgba(143, 143, 223, 0.1) 100%)',
				'nav-item-active': 'linear-gradient(90deg, rgba(127, 127, 213, 0.2) 0%, rgba(143, 143, 223, 0.4) 50%, rgba(159, 159, 233, 0.3) 100%)',
				'sidebar-bg': 'linear-gradient(to bottom, #1E1E1E 0%, rgba(127, 127, 213, 0.1) 50%, rgba(63, 63, 173, 0.2) 100%)',
				'sidebar-active': 'linear-gradient(to bottom right, #6B5FC7 0%, #7F7FD5 50%, #9B8FE8 100%)',
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					'0%': {
						opacity: '0',
					},
					'100%': {
						opacity: '1',
					}
				},
				'fade-out': {
					'0%': {
						opacity: '1',
					},
					'100%': {
						opacity: '0',
					}
				},
				'slide-down': {
					'0%': {
						transform: 'translateY(-10px)',
						opacity: '0',
					},
					'100%': {
						transform: 'translateY(0)',
						opacity: '1',
					}
				},
				'slide-up': {
					'0%': {
						transform: 'translateY(0)',
						opacity: '1',
					},
					'100%': {
						transform: 'translateY(-10px)',
						opacity: '0',
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.3s ease-out',
				'fade-out': 'fade-out 0.3s ease-out',
				'slide-down': 'slide-down 0.3s ease-out',
				'slide-up': 'slide-up 0.3s ease-out',
			},
			textShadow: {
				'sm': '1px 1px 2px rgba(0, 0, 0, 0.5)',
				'DEFAULT': '2px 2px 4px rgba(0, 0, 0, 0.5)',
				'lg': '3px 3px 6px rgba(0, 0, 0, 0.7)',
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		function({ addUtilities, theme }: any) {
			const textShadowUtilities = Object.entries(theme('textShadow')).reduce(
				(acc: any, [key, value]) => {
					acc[`.text-shadow${key === 'DEFAULT' ? '' : `-${key}`}`] = {
						textShadow: value,
					};
					return acc;
				},
				{}
			);
			addUtilities(textShadowUtilities);
		}
	],
} satisfies Config;
