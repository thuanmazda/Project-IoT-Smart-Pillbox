# 💊 IoT Smart Pillbox - Hộp Thuốc Thông Minh

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ESP32-green.svg)
![Framework](https://img.shields.io/badge/framework-Arduino%20IDE-orange.svg)

**IoT Smart Pillbox** là hệ thống hộp thuốc điện tử thông minh được thiết kế nhằm hỗ trợ người cao tuổi và bệnh nhân trong việc tuân thủ phác đồ điều trị. Dự án ứng dụng vi điều khiển ESP32, kết hợp đồng bộ hóa đám mây qua Google Apps Script và hệ thống cảnh báo tức thời qua Telegram.

> **Đồ án môn học 1 (EE3183)** > Khoa Điện - Điện tử, Trường Đại học Bách Khoa - ĐHQG TP.HCM.

---

## ✨ Tính năng nổi bật
* **Định thời gian thực chuẩn xác:** Sử dụng module RTC DS3231 đảm bảo báo thức hoạt động chính xác ngay cả khi mất kết nối Internet.
* **Cấu hình Wi-Fi động (Captive Portal):** Cho phép người dùng kết nối mạng mới thông qua điện thoại thông minh (WiFiManager) mà không cần nạp lại mã nguồn.
* **Theo dõi & Báo cáo đám mây:** Tự động đẩy lịch sử đóng/mở nắp hộp (thông qua công tắc hành trình) lên Google Sheets.
* **Cảnh báo Telegram tức thời:** Gửi tin nhắn thông báo cho người nhà khi đến giờ uống thuốc, uống thuốc trễ hoặc mở hộp sai giờ.
* **Tối ưu năng lượng:** Tích hợp tính năng Deep Dimming (giảm sáng màn hình OLED) để tiết kiệm pin tối đa.
* **Lưu trữ ngoại tuyến (Offline Mode):** Lưu trữ tạm thời dữ liệu vào bộ nhớ Flash (NVS) khi rớt mạng và tự động đồng bộ lại khi có kết nối.

---

## 📂 Cấu trúc thư mục (Directory Tree)

```text
IoT-Smart-Pillbox/
├── 📁 Firmware/
│   └── 📄 ESP32_Pillbox.ino          # Mã nguồn C++ nạp cho vi điều khiển ESP32
├── 📁 Web_App_Script/
│   ├── 📄 Code.gs                    # Mã nguồn Backend (Google Apps Script)
│   └── 📄 Index.html                 # Giao diện Web quản lý (Frontend)
├── 📁 Hardware/
│   ├── 📄 Schematic_Altium.pdf       # File PDF bản vẽ sơ đồ nguyên lý
│   └── 📄 BOM.csv                    # Bảng danh mục vật tư (Bill of Materials)
├── 📁 Docs/
│   └── 📄 BAO_CAO_DO_AN_1.pdf        # Báo cáo thuyết minh chi tiết của đồ án
└── 📄 README.md                      # Tài liệu hướng dẫn dự án (File này)
