package services

// GreetService 提供给前端的示例服务,后续可按需替换或删除。
type GreetService struct{}

// NewGreetService 构造函数,便于注入依赖(如 logger、store)。
func NewGreetService() *GreetService {
	return &GreetService{}
}

// Greet 返回问候语。
func (g *GreetService) Greet(name string) string {
	return "Hello " + name + "!"
}