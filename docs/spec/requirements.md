# Requirements Document

## Introduction

本文档描述南向设备Web监控系统的功能需求。该系统使GuardSys设备能够通过TCP连接上报传感器数据，Web前端实时显示设备状态，用户可通过网页控制设备，并接收报警推送通知。

## Glossary

- **南向设备**：指连接传感器和执行器的OpenHarmony开发板（GuardSys）
- **北向系统**：指Web服务器和前端监控系统
- **Server酱**：免费微信推送服务，用于报警通知

## Requirements

### R1: 设备连接管理

**User Story:** 作为系统管理员，我希望设备能够主动连接服务器并上报数据，以便实时监控设备状态

#### Acceptance Criteria

1. WHEN 南向设备通过TCP连接到服务器时，服务器 SHALL 保存设备连接信息
2. WHEN 南向设备断开连接时，服务器 SHALL 记录断开时间并在Web界面显示离线状态
3. IF 同一设备重复连接，服务器 SHALL 更新连接时间并保持单一连接

### R2: 传感器数据接收与存储

**User Story:** 作为用户，我希望在网页上实时查看设备的传感器数据

#### Acceptance Criteria

1. WHEN 南向设备发送JSON数据（type=report）时，服务器 SHALL 解析并存储传感器数据
2. WHEN 数据接收成功，服务器 SHALL 返回确认消息给设备
3. IF 数据格式不正确，服务器 SHALL 返回错误消息并记录日志

### R3: 实时数据展示

**User Story:** 作为用户，我希望在网页上实时看到设备的温湿度、烟雾浓度、红外状态

#### Acceptance Criteria

1. WHILE 设备在线，Web界面 SHALL 每秒更新显示最新传感器数据
2. WHEN 数据更新时，界面 SHALL 平滑过渡显示新值
3. IF 设备离线，界面 SHALL 显示"离线"状态且数据停止更新

### R4: 设备控制

**User Story:** 作为用户，我希望通过网页控制设备的报警模式

#### Acceptance Criteria

1. WHEN 用户点击报警模式按钮时，Web前端 SHALL 发送控制指令到服务器
2. WHEN 服务器收到控制指令时，服务器 SHALL 转发给对应设备
3. IF 设备不在线，界面 SHALL 显示"发送失败，设备离线"

### R5: 报警推送

**User Story:** 作为用户，我希望在发生报警时通过微信收到通知

#### Acceptance Criteria

1. WHEN 烟雾浓度>=200或温度>=40时，系统 SHALL 自动触发Server酱推送报警
2. IF 报警条件满足且未推送过，系统 SHALL 发送Server酱请求
3. IF 报警条件不满足，系统 SHALL 不发送推送

### R6: 历史数据

**User Story:** 作为用户，我希望查看设备的历史数据记录

#### Acceptance Criteria

1. WHEN 用户访问历史页面时，系统 SHALL 显示最近24小时的数据记录
2. IF 数据超过7天，系统 SHALL 自动清理旧数据

## Acceptance Criteria Summary

- [ ] 设备能够通过TCP连接服务器并上报数据
- [ ] Web界面实时显示温度、湿度、烟雾、红外状态
- [ ] 用户可通过网页设置报警模式
- [ ] 报警条件满足时自动推送Server酱通知
- [ ] 支持多设备同时在线
- [ ] 设备离线时显示对应状态
