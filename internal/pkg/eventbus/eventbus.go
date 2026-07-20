package eventbus

// Emitter 抽象事件推送能力,便于解耦 Wails application 依赖与测试。
// 具体实现由 app 层在装配 Wails application 后注入到各 Service。
type Emitter interface {
	EmitEvent(name string, data any)
}
