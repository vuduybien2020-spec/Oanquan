# Ô Ăn Quan Tết 2027

Game web Ô Ăn Quan 2 người, giao diện đỏ-vàng Tết, hỗ trợ tạo phòng, mã phòng, QR, đồng bộ lượt chơi qua Socket.IO và hiển thị tốt trên điện thoại.

## Chạy local
- Cài Node.js 18+
- `npm install`
- `npm start`
- Mở `http://localhost:3000`

## Deploy Railway
Đưa toàn bộ nội dung thư mục dự án lên GitHub, kết nối Railway. Railway tự chạy `npm start`; không cần khai báo PORT vì server đọc `process.env.PORT`.

## Luật đang triển khai
Bản này là bản chơi 2 người với 5 quân dân mỗi ô, 10 quân quy ước trong mỗi ô quan, rải thuận/ngược và cơ chế ăn quân cơ bản. Luật ăn quân có thể cần tinh chỉnh theo biến thể địa phương mong muốn.
