# 支付宝收款接入说明

当前项目已经有支付宝收款骨架，但默认不会真实收款。需要先在支付宝开放平台完成商户应用、签约支付产品、配置密钥，然后再填 `.env`。

## 已实现内容

- `GET /api/payments/plans`：返回可购买套餐和支付宝配置状态。
- `POST /api/payments/alipay/create`：生成支付宝电脑网站支付或手机网站支付的提交表单。
- `POST /api/payments/alipay/notify`：接收支付宝异步通知并做 RSA2 验签、金额校验、AppID 校验。
- `GET /api/payments/alipay/return`：支付完成后的同步跳转入口。
- 前端「我的 -> Plus 权益预览」里已经接了支付宝付款按钮。

## 需要填写的环境变量

```env
PUBLIC_BASE_URL=https://你的正式域名
ALIPAY_GATEWAY_MODE=sandbox
ALIPAY_APP_ID=你的支付宝开放平台 AppID
ALIPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n你的应用私钥\n-----END PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n支付宝公钥\n-----END PUBLIC KEY-----"
ALIPAY_NOTIFY_URL=https://你的正式域名/api/payments/alipay/notify
ALIPAY_RETURN_URL=https://你的正式域名/api/payments/alipay/return
```

本地调试建议先用沙箱。上线后把 `ALIPAY_GATEWAY_MODE` 改成 `production`，并确认支付宝后台里的应用网关、授权回调、支付产品签约状态都正确。

## 上线前必须做

1. 先用沙箱账号完成一次 0.01 元测试订单。
2. 确认异步通知返回 `success`，否则支付宝会重复通知。
3. 把订单存储从当前内存 `Map` 换成数据库；内存重启就丢，只适合开发验证。
4. 不要在前端保存任何支付宝私钥或商户密钥。
5. 面向 14-25 岁用户时，支付页必须清楚展示价格、权益、退款/取消规则；未成年人付费前需要监护人同意。

## 官方入口

- 支付宝开放平台：https://open.alipay.com/
- 支付宝文档中心：https://openhome.alipay.com/docCenter/docCenter.htm
- 支付宝产品文档入口：https://open.alipay.com/productDocument.htm
