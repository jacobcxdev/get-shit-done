# GSD ドキュメント

> **Fork notice / フォーク通知 / 분기 안내 / Aviso de fork / 分支说明:**
> This is Jacob Clayden's fork of upstream GSD. Install instructions in this translation may
> reference the upstream repository and are NOT guaranteed to work for this fork. For
> current install instructions see the English [README.md](../../README.md). Upstream:
> https://github.com/gsd-build/get-shit-done

Get Shit Done（GSD）フレームワークの包括的なドキュメントです。GSD は、AI コーディングエージェント向けのメタプロンプティング、コンテキストエンジニアリング、仕様駆動開発システムです。

## ドキュメント一覧

| ドキュメント | 対象読者 | 説明 |
|------------|---------|------|
| [アーキテクチャ](ARCHITECTURE.md) | コントリビューター、上級ユーザー | システムアーキテクチャ、エージェントモデル、データフロー、内部設計 |
| [機能リファレンス](FEATURES.md) | 全ユーザー | 全機能の詳細ドキュメントと要件 |
| [コマンドリファレンス](COMMANDS.md) | 全ユーザー | 全コマンドの構文、フラグ、オプション、使用例 |
| [設定リファレンス](CONFIGURATION.md) | 全ユーザー | 設定スキーマ、ワークフロートグル、モデルプロファイル、Git ブランチ |
| [CLI ツールリファレンス](CLI-TOOLS.md) | コントリビューター、エージェント作成者 | CJS `gsd-tools.cjs` と **`gsd-sdk query` / SDK** のガイド |
| [エージェントリファレンス](AGENTS.md) | コントリビューター、上級ユーザー | 全18種の専門エージェント — 役割、ツール、スポーンパターン |
| [ユーザーガイド](USER-GUIDE.md) | 全ユーザー | ワークフローのウォークスルー、トラブルシューティング、リカバリー |
| [コンテキストモニター](context-monitor.md) | 全ユーザー | コンテキストウィンドウ監視フックのアーキテクチャ |
| [ディスカスモード](workflow-discuss-mode.md) | 全ユーザー | discuss フェーズにおける assumptions モードと interview モード |

## クイックリンク

- **v1.32 の新機能:** STATE.md 整合性ゲート、`--to N` 自律モード、リサーチゲート、ベリファイヤーマイルストーンスコープフィルタリング、read-before-edit ガード、コンテキスト削減、新規ランタイム（Trae, Cline, Augment Code）、レスポンス言語設定、`--power`/`--diagnose` フラグ、`/gsd-analyze-dependencies`
- **はじめに:** [README](../README.md) → インストール → `/gsd-new-project`
- **ワークフロー完全ガイド:** [ユーザーガイド](USER-GUIDE.md)
- **コマンド一覧:** [コマンドリファレンス](COMMANDS.md)
- **GSD の設定:** [設定リファレンス](CONFIGURATION.md)
- **システム内部の仕組み:** [アーキテクチャ](ARCHITECTURE.md)
- **コントリビュートや拡張:** [CLI ツールリファレンス](CLI-TOOLS.md) + [エージェントリファレンス](AGENTS.md)
