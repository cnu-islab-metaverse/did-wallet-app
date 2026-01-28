# DID Wallet App

A decentralized identity (DID) wallet application built with React, supporting both desktop (Electron) and Chrome Extension platforms.

## 🚀 Features

- **Cross-Platform**: Desktop app (Electron) and Chrome Extension
- **Shared Components**: Common React components between platforms
- **DID Management**: Decentralized Identity wallet functionality
- **Secure Storage**: Encrypted storage for sensitive data
- **Modern UI**: Built with React 19 and modern web technologies

## 📦 Project Structure

```
did-wallet-app/
├── src/                    # Shared components and logic
│   ├── App.tsx            # Main shared App component
│   └── App.css            # Shared styles
├── desktop/               # Electron desktop application
│   ├── electron/          # Electron main process
│   └── src/               # Desktop-specific React components
├── ext/                   # Chrome Extension
│   ├── pages/popup/       # Extension popup
│   └── chrome-extension/  # Extension manifest and background
└── package.json           # Root package configuration
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm (for extension) / yarn (for desktop)

### Installation

```bash
# Install dependencies for all platforms
npm install

# Install desktop dependencies
cd desktop && yarn install

# Install extension dependencies
cd ext && pnpm install
```

### Development Commands

```bash
# Run both desktop and extension in development
npm run dev

# Run desktop only
npm run dev:desktop

# Run extension only
npm run dev:ext
```

### Build Commands

```bash
# Build all platforms
npm run build

# Build desktop only
npm run build:desktop

# Build extension only
npm run build:ext
```

## 🔧 Chrome Extension Development

1. Build the extension:
   ```bash
   cd ext && pnpm build
   ```

2. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `ext/dist` folder

## 🖥️ Desktop Development

1. Start development server:
   ```bash
   cd desktop && yarn dev
   ```

2. The Electron app will launch automatically with hot reload enabled.

## 📝 Shared Components

The `src/` directory contains shared React components that are used by both the desktop app and Chrome extension:

- **App.tsx**: Main application component with platform-specific props
- **App.css**: Shared styling with platform-specific variants

## 🔐 Security

This wallet application handles sensitive cryptographic operations and private keys. Always ensure:

- Secure storage implementation
- Proper key management
- Regular security audits
- Safe handling of user data

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary. All rights reserved.

## 🆘 Support

For support and questions, please create an issue in this repository.
"# did-wallet-app" 
