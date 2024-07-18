addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  if (url.pathname === '/webhook') {
    const update = await request.json()
    await handleUpdate(update)
    return new Response('OK')
  }
  return new Response('Not Found', { status: 404 })
}

async function handleUpdate(update) {
  if (update.message) {
    await onMessage(update.message)
  } else if (update.callback_query) {
    await onCallbackQuery(update.callback_query)
  }
}

async function onMessage(message) {
  const chatId = message.chat.id.toString()

  // 检查是否是管理员的回复消息
  if (chatId === GROUP_ID) {
    // 获取当前话题 ID
    const topicId = message.message_thread_id
    if (topicId) {
      // 获取私聊对象的 chatId
      const privateChatId = await getPrivateChatId(topicId)
      if (privateChatId) {
        // 转发消息给私聊对象
        await forwardMessageToPrivateChat(privateChatId, message)
        return
      }
    }
  }

  // 获取用户信息
  const userInfo = await getUserInfo(chatId)
  const userName = userInfo.username || userInfo.first_name
  const nickname = `${userInfo.first_name} ${userInfo.last_name || ''}`.trim()
  const topicName = `${nickname}`

  // 检查是否已经存在与该用户相关的话题
  let topicId = await getExistingTopicId(chatId)
  if (!topicId) {
    // 如果不存在，则创建新话题
    topicId = await createForumTopic(topicName, userName, nickname)
    // 存储话题 ID 和私聊对象的 chatId
    await saveTopicId(chatId, topicId)
    // 发送欢迎消息
    await sendMessageToUser(chatId, "你好，欢迎使用私聊机器人！")
  }

  // 发送消息到话题，并添加对方的昵称
  if (message.text) {
    const formattedMessage = `*${nickname}:*\n------------------------------------------------\n\n${message.text}`
    await sendMessageToTopic(topicId, formattedMessage)
  } else {
    await copyMessageToTopic(topicId, message)
  }
}

async function getUserInfo(chatId) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId
    })
  })
  const data = await response.json()
  return data.result
}

async function getExistingTopicId(chatId) {
  const topicId = await TOPIC_KV.get(chatId)
  return topicId
}

async function createForumTopic(topicName, userName, nickname) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createForumTopic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: GROUP_ID,
      name: topicName
    })
  })
  const data = await response.json()
  const topicId = data.result.message_thread_id

  // 获取当前时间
  const now = new Date()
  const formattedTime = now.toISOString().replace('T', ' ').substring(0, 19)

  // 发送并置顶消息
  const pinnedMessage = `昵称: ${nickname}\n用户名: ${userName}\nUserID: ${userId}\n发起时间: ${formattedTime}`
  const messageResponse = await sendMessageToTopic(topicId, pinnedMessage)
  const messageId = messageResponse.result.message_id
  await pinMessage(topicId, messageId)

  return topicId
}

async function saveTopicId(chatId, topicId) {
  // 存储话题 ID 和私聊对象的 chatId 到 KV 存储
  await TOPIC_KV.put(chatId, topicId)
  await TOPIC_KV.put(topicId, chatId)
}

async function getPrivateChatId(topicId) {
  const privateChatId = await TOPIC_KV.get(topicId)
  return privateChatId
}

async function sendMessageToTopic(topicId, text) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: GROUP_ID,
      text: text,
      message_thread_id: topicId,
      parse_mode: 'Markdown'
    })
  })
  return response.json()
}

async function copyMessageToTopic(topicId, message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: GROUP_ID,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
      message_thread_id: topicId
    })
  })
}

async function pinMessage(topicId, messageId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: GROUP_ID,
      message_id: messageId,
      message_thread_id: topicId
    })
  })
}

async function forwardMessageToPrivateChat(chatId, message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      from_chat_id: message.chat.id,
      message_id: message.message_id
    })
  })
}

async function sendMessageToUser(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  })
}

async function onCallbackQuery(callbackQuery) {
  // 处理回调查询
}