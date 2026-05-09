# Tasks

- [x] Task 1: 创建代码展示组件
  - [x] SubTask 1.1: 创建CodeBlock.tsx组件，支持语法高亮
  - [x] SubTask 1.2: 添加代码复制功能
  - [x] SubTask 1.3: 添加文件路径显示
  - [x] SubTask 1.4: 支持多种语言高亮（Dart, Kotlin, TypeScript）

- [x] Task 2: 创建火山引擎技术特性展示组件
  - [x] SubTask 2.1: 创建VolcEngineFeatures.tsx组件
  - [x] SubTask 2.2: 添加低延迟特性说明（1秒响应、5000+边缘节点）
  - [x] SubTask 2.3: 添加弱网抗性说明（80%丢包稳定）
  - [x] SubTask 2.4: 添加编解码技术说明（H.266/VVC、BVC2）
  - [x] SubTask 2.5: 添加智能码率分配说明

- [x] Task 3: 创建豆包语音模型特性组件
  - [x] SubTask 3.1: 创建DoubaoVoiceModels.tsx组件
  - [x] SubTask 3.2: 添加ASR 2.0特性（上下文理解、多模态、13种语言）
  - [x] SubTask 3.3: 添加TTS 2.0特性（情感表达、教育优化、同款音色）
  - [x] SubTask 3.4: 添加实时交互三大亮点（插话、低延迟、VAD）

- [x] Task 4: 创建AI语音通话技术详情组件
  - [x] SubTask 4.1: 提取VoiceCallService核心代码片段
  - [x] SubTask 4.2: 创建VoiceCallDetail.tsx组件
  - [x] SubTask 4.3: 展示WebSocket连接流程代码
  - [x] SubTask 4.4: 展示音频流处理代码（PCM录音、流式传输）
  - [x] SubTask 4.5: 展示ASR/TTS回调处理代码
  - [x] SubTask 4.6: 展示智能打断实现代码
  - [x] SubTask 4.7: 添加技术要点说明

- [x] Task 5: 创建AI视频通话技术详情组件
  - [x] SubTask 5.1: 提取VideoCallService核心代码片段
  - [x] SubTask 5.2: 创建VideoCallDetail.tsx组件
  - [x] SubTask 5.3: 展示RTC初始化代码
  - [x] SubTask 5.4: 展示音视频处理代码
  - [x] SubTask 5.5: 展示AI Agent启动代码
  - [x] SubTask 5.6: 添加技术要点说明

- [x] Task 6: 创建实时通信协议详情组件
  - [x] SubTask 6.1: 提取RealtimeProtocol核心代码
  - [x] SubTask 6.2: 创建ProtocolDetail.tsx组件
  - [x] SubTask 6.3: 展示协议帧结构代码
  - [x] SubTask 6.4: 展示消息类型枚举代码
  - [x] SubTask 6.5: 展示Gzip压缩逻辑代码
  - [x] SubTask 6.6: 添加协议说明文档

- [x] Task 7: 创建架构图组件
  - [x] SubTask 7.1: 设计系统架构SVG图
  - [x] SubTask 7.2: 创建ArchitectureDiagram.tsx组件
  - [x] SubTask 7.3: 展示客户端层、通信层、服务层、AI层
  - [x] SubTask 7.4: 添加数据流向标注

- [x] Task 8: 创建技术详情展示区域
  - [x] SubTask 8.1: 创建TechDetailSection.tsx组件
  - [x] SubTask 8.2: 整合所有技术详情子组件
  - [x] SubTask 8.3: 添加Tab切换功能（技术特性/代码实现/架构图）
  - [x] SubTask 8.4: 添加响应式布局

- [x] Task 9: 更新App.tsx整合新组件
  - [x] SubTask 9.1: 导入TechDetailSection组件
  - [x] SubTask 9.2: 添加到页面适当位置
  - [x] SubTask 9.3: 更新导航链接

- [x] Task 10: 测试与优化
  - [x] SubTask 10.1: 测试代码复制功能
  - [x] SubTask 10.2: 测试Tab切换功能
  - [x] SubTask 10.3: 测试响应式布局
  - [x] SubTask 10.4: 构建验证

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 1]
- [Task 6] depends on [Task 1]
- [Task 8] depends on [Task 2, Task 3, Task 4, Task 5, Task 6, Task 7]
- [Task 9] depends on [Task 8]
- [Task 10] depends on [Task 9]
