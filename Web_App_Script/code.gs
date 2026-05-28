// LINK GOOGLE SHEET VÀ TOKEN BOT:
var sheetUrl = 'https://docs.google.com/spreadsheets/d/1F7vB3ncXRynr4YONkt-7NzRndev7CFtMYesXiH4w0Is/edit?usp=sharing'; 
var botToken = '8729962677:AAGrT5_69f5CqL8aJl88RomJfY0KPr3c-cs';
var sheetName = 'Data'; 
var settingsSheetName = 'Settings';

// ID CỦA NGƯỜI NHẬN ĐỂ NHẬN CẢNH BÁO CHỦ ĐỘNG
var masterChatId = 1922974253;

// HÀM GỬI TIN NHẮN CHỦ ĐỘNG
function sendTelegramNotification(message) {
  if(masterChatId === 'ĐIỀN_CHAT_ID_CỦA_BẠN_VÀO_ĐÂY') return; // Bỏ qua nếu chưa điền ID
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var payload = {
    "chat_id": masterChatId,
    "text": message,
    "parse_mode": "HTML"
  };
  UrlFetchApp.fetch(url, {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  });
}

// ==========================================
// CÁC HÀM CƠ SỞ VÀ WEB DASHBOARD
// ==========================================

function capQuyenTruyCap() {
  SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName).getDataRange().getValues();
  SpreadsheetApp.openByUrl(sheetUrl).getSheetByName('Settings').getDataRange().getValues();
  UrlFetchApp.fetch("https://api.telegram.org/bot" + botToken + "/getMe");
  PropertiesService.getScriptProperties().setProperty("Test", "OK");
}

function xoaDuLieuThangCu() {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var currentMonth = Utilities.formatDate(new Date(), "GMT+7", "MM/yyyy");
  for (var i = data.length - 1; i > 0; i--) { 
    var timeStr = String(data[i][0]).replace("'", "").trim();
    if (!timeStr) continue;
    var dateP = timeStr.split(" ")[0].split("/");
    if (dateP.length === 3 && (dateP[1] + "/" + dateP[2]) !== currentMonth) sheet.deleteRow(i + 1); 
  }
}

function doGet(e) {
  try {
    // NẾU TRUY CẬP TỪ TRÌNH DUYỆT -> MỞ DASHBOARD
    if (!e.parameter || !e.parameter.action) {
      return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('Dashboard Hộp Thuốc IoT')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    var action = e.parameter.action;
    var now = new Date();
    var currentTimestampStr = "'" + Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm:ss");
    
    // --- KHAI BÁO BIẾN CHUẨN XÁC ---
    var ss = SpreadsheetApp.getActiveSpreadsheet(); // Lấy toàn bộ File
    var dataSheet = ss.getSheetByName("Data");      // Chỉ định đúng Tab chứa Log (CHÚ Ý: Tên tab phải đúng là "Data")
    var settingSheet = ss.getSheetByName("CaiDat"); // Chỉ định đúng Tab chứa Ping
    
    // Bẫy lỗi nếu bạn lỡ gõ sai tên Tab
    if (!dataSheet || !settingSheet) {
      return ContentService.createTextOutput("LỖI MÁY CHỦ: Không tìm thấy Tab 'Data' hoặc 'CaiDat'");
    }

    // 1. NẾU LÀ TÍN HIỆU PING -> CHỈ CẬP NHẬT THỜI GIAN
    if (action == "Ping") {
      settingSheet.getRange("B1").setValue(now); 
      return ContentService.createTextOutput("Ping OK");
    }

    // 2. NẾU LÀ LỆNH LẤY TRẠNG THÁI (ĐỂ HIỂN THỊ LÊN WEB)
    if (action == "get_status") {
      var lastPing = settingSheet.getRange("B1").getValue();
      var diffMins = Math.round((now - lastPing) / 60000);
      
      if (diffMins <= 20) {
        return ContentService.createTextOutput("ONLINE");
      } else {
        return ContentService.createTextOutput("OFFLINE");
      }
    }

    // -------------------------------------------------------------
    // NHÓM HÀNH ĐỘNG GHI LOG CƠ BẢN VÀ PUSH THÔNG BÁO TELEGRAM
    // -------------------------------------------------------------
    if (action === "Mo_Nap" || action === "Dong_Nap" || action === "Bo_Thuoc") {
      var actStr = "Mở nắp";
      if (action === "Dong_Nap") actStr = "Đóng nắp";
      if (action === "Bo_Thuoc") actStr = "Bỏ thuốc";
      
      // Ghi lịch sử vào Tab Data
      dataSheet.appendRow([currentTimestampStr, actStr]);

      // GỌI HÀM GỬI CẢNH BÁO CHO TỪNG TRƯỜNG HỢP
      if (action === "Bo_Thuoc") {
        sendTelegramNotification("<b>[!] CẢNH BÁO CHƯA UỐNG THUỐC</b>\n------------------\n⏰ <b>Thời gian:</b> " + currentTimestampStr.replace("'","") + "\n<i>Bệnh nhân đã bỏ lỡ một cữ thuốc! Vui lòng kiểm tra ngay.</i>");
      } else if (action === "Mo_Nap") {
        sendTelegramNotification("<b>[OK] ĐÃ UỐNG THUỐC (ĐÚNG GIỜ)</b>\n------------------\n⏰ <b>Thời gian:</b> " + currentTimestampStr.replace("'",""));
      }

      return ContentService.createTextOutput("SUCCESS");
    }
    
    // -------------------------------------------------------------
    // 3. HÀNH ĐỘNG GỬI LỊCH CHO ESP32
    // -------------------------------------------------------------
    else if (action === "get_alarms") {
      var alarms = getAlarmsFromSheet(); 
      var espFormat = [];
      for(var i=0; i < alarms.length; i++) {
        try {
          var obj = JSON.parse(alarms[i]);
          espFormat.push(obj.time + "|" + obj.days.join("") + "|" + (obj.repeat ? "1" : "0"));
        } catch(err) { 
          espFormat.push(alarms[i] + "|1234560|1"); 
        }
      }
      return ContentService.createTextOutput(espFormat.join(",")); 
    }
    
    // -------------------------------------------------------------
    // 4. HÀNH ĐỘNG XỬ LÝ UỐNG TRỄ 
    // -------------------------------------------------------------
    else if (action === "Uong_Tre") {
      var data = dataSheet.getDataRange().getValues();
      var isUpdated = false;
      
      // Tìm ngược từ dưới lên (Dừng ở dòng 1 để bỏ qua Header)
      for (var i = data.length - 1; i >= 1; i--) {
        var cellStatus = data[i][1]; 
        
        if (cellStatus === "Bỏ thuốc" || cellStatus === "Bo_Thuoc") {
          var rawDateStr = data[i][0].toString().replace("'", ""); 
          var rowDate;
          try {
            var parts = rawDateStr.split(" ");
            var dParts = parts[0].split("/"); 
            var tParts = parts[1].split(":"); 
            rowDate = new Date(dParts[2], dParts[1] - 1, dParts[0], tParts[0], tParts[1], tParts[2]); 
          } catch(err) { rowDate = new Date(0); }

          // Kiểm tra xem khoảng cách có nằm trong 60 phút (3,600,000 ms) không
          if ((now.getTime() - rowDate.getTime()) <= 3600000) {
            dataSheet.getRange(i + 1, 2).setValue("Uống trễ"); 
            var currentHourStr = Utilities.formatDate(now, "GMT+7", "HH:mm");
            var newTimeFormat = "'" + Utilities.formatDate(rowDate, "GMT+7", "dd/MM/yyyy") + " " + currentHourStr + " (Trễ)";
            dataSheet.getRange(i + 1, 1).setValue(newTimeFormat);
            isUpdated = true;
            break; 
          }
        }
      }
      
      // PUSH THÔNG BÁO UỐNG TRỄ
      sendTelegramNotification("<b>[INFO] BỆNH NHÂN UỐNG TRỄ</b>\n------------------\n⏰ <b>Thời gian:</b> " + currentTimestampStr.replace("'","") + "\n<i>Bệnh nhân đã uống bù cữ thuốc bị lỡ.</i>");

      if (!isUpdated) {
        dataSheet.appendRow([currentTimestampStr, "Uống trễ"]);
        return ContentService.createTextOutput("SUCCESS_NEW");
      } else {
        return ContentService.createTextOutput("SUCCESS_UPDATED");
      }
    }

    return ContentService.createTextOutput("ERROR_UNKNOWN_ACTION");

  } catch (error) {
    // NẾU CODE CÓ LỖI, TRẢ THẲNG DÒNG MÀU ĐỎ VỀ CHO ESP32 ĐỌC
    return ContentService.createTextOutput("LỖI GAS: " + error.toString() + " (Dòng: " + error.lineNumber + ")");
  }
}

function getDashboardStats() {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName);
  var data = sheet.getDataRange().getDisplayValues(); 
  
  var now = new Date();
  var vnTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"})); 
  var todayInt = parseInt(Utilities.formatDate(vnTime, "GMT+7", "yyyyMMdd"), 10);
  var monthStartInt = parseInt(Utilities.formatDate(vnTime, "GMT+7", "yyyyMM01"), 10);
  var dayOfWeek = vnTime.getDay(); 
  var daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
  var weekStartInt = parseInt(Utilities.formatDate(new Date(vnTime.getTime() - (daysToSubtract * 86400000)), "GMT+7", "yyyyMMdd"), 10);

  var stats = { today: 0, week: 0, month: 0, todayTimes: [], missedToday: 0, missedTodayTimes: [] };
  var dailyStats = {}; 

  for (var i = 1; i < data.length; i++) {
    var timeString = String(data[i][0]).replace("'", "").trim();
    var actionString = String(data[i][1]).trim();
    if (!timeString || timeString === "") continue;

    var parts = timeString.split(" ");
    var dateParts = parts[0].split("/"); 
    if (dateParts.length < 3) continue;
    
    var rowInt = parseInt(dateParts[2] + dateParts[1] + dateParts[0], 10);
    var rDateStr = dateParts[0] + "/" + dateParts[1] + "/" + dateParts[2];

    if (rowInt >= monthStartInt) {
      if (!dailyStats[rDateStr]) dailyStats[rDateStr] = { count: 0, isOpen: false, times: [], missed: 0, missedTimes: [] };
      
      var hhmm = parts[1] ? parts[1].substring(0, 5) : "";

      if (actionString === "Mở nắp") dailyStats[rDateStr].isOpen = true;
      else if (actionString === "Đóng nắp") {
          if (dailyStats[rDateStr].isOpen) {
              dailyStats[rDateStr].count++;
              dailyStats[rDateStr].isOpen = false; 
              if (hhmm) dailyStats[rDateStr].times.push(hhmm);
          }
      } else if (actionString === "Bỏ thuốc") {
          dailyStats[rDateStr].missed++;
          if (hhmm) dailyStats[rDateStr].missedTimes.push(hhmm);
      }
    }
  }

  var dKeys = Object.keys(dailyStats);
  for(var k=0; k<dKeys.length; k++) {
      var d = dKeys[k];
      var c = dailyStats[d].count;
      var dParts = d.split("/");
      var dInt = parseInt(dParts[2] + dParts[1] + dParts[0], 10);
      
      if(dInt === todayInt) {
          stats.today += c;
          stats.todayTimes = dailyStats[d].times;
          stats.missedToday = dailyStats[d].missed;
          stats.missedTodayTimes = dailyStats[d].missedTimes;
      }
      if(dInt >= weekStartInt && dInt <= todayInt) stats.week += c;
      if(dInt >= monthStartInt && dInt <= todayInt) stats.month += c;
  }
  return stats;
}

function getAlarmsFromSheet() {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName('Settings');
  var data = sheet.getDataRange().getValues();
  var alarms = [];
  if(data.length >= 2) {
    for(var col=0; col<data[1].length; col++) {
      var timeStr = String(data[1][col]).trim();
      if(timeStr !== "") alarms.push(timeStr);
    }
  }
  return alarms;
}

function saveAlarmsToSheet(alarmsArray) {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName('Settings');
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  if(alarmsArray.length > 0) sheet.getRange(2, 1, 1, alarmsArray.length).setValues([alarmsArray]);
  return "Đã lưu cài đặt lên Cloud!";
}

// Telegram Bot tích hợp Bỏ thuốc
function doPost(e) {
  try {
    var update = JSON.parse(e.postData.contents);
    var updateId = String(update.update_id); 
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(updateId)) return HtmlService.createHtmlOutput("OK"); 
    props.setProperty(updateId, "done");

    if (update.message && update.message.text) {
      var chatId = update.message.chat.id;
      var text = update.message.text.trim();

      if (text === '/homnay' || text === '/tuannay' || text === '/thangnay') {
        var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName);
        var data = sheet.getDataRange().getDisplayValues(); 
        
        var now = new Date();
        var vnTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"})); 
        var todayStr = Utilities.formatDate(vnTime, "GMT+7", "dd/MM/yyyy");
        var todayInt = parseInt(Utilities.formatDate(vnTime, "GMT+7", "yyyyMMdd"), 10);
        var monthStartInt = parseInt(Utilities.formatDate(vnTime, "GMT+7", "yyyyMM01"), 10);
        var dayOfWeek = vnTime.getDay(); 
        var daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        var weekStartInt = parseInt(Utilities.formatDate(new Date(vnTime.getTime() - (daysToSubtract * 86400000)), "GMT+7", "yyyyMMdd"), 10);

        var targetStartInt; var titleText = "";
        if (text === '/homnay') { targetStartInt = todayInt; titleText = "HÔM NAY"; }
        else if (text === '/tuannay') { targetStartInt = weekStartInt; titleText = "TUẦN NÀY"; }
        else if (text === '/thangnay') { targetStartInt = monthStartInt; titleText = "THÁNG NÀY"; }

        var dailyStats = {}; var homNayLogs = ""; var homNayActions = 0;

        for (var i = 1; i < data.length; i++) {
          var timeString = String(data[i][0]).replace("'", "").trim();
          var actionString = String(data[i][1]).trim();
          if (!timeString || timeString === "") continue;

          var parts = timeString.split(" ");
          var dateParts = parts[0].split("/"); 
          if (dateParts.length < 3) continue;
          var rowInt = parseInt(dateParts[2] + dateParts[1] + dateParts[0], 10);
          var rDateStr = dateParts[0] + "/" + dateParts[1] + "/" + dateParts[2];

          if (rowInt >= targetStartInt && rowInt <= todayInt) {
            if (text === '/homnay' && rowInt === todayInt) {
               homNayLogs += "🔹 Lúc " + (parts[1] || timeString) + " -> " + actionString + "\n";
               homNayActions++;
            }
            if (!dailyStats[rDateStr]) dailyStats[rDateStr] = { count: 0, isOpen: false, times: [], missed: 0 };

            if (actionString === "Mở nắp") dailyStats[rDateStr].isOpen = true;
            else if (actionString === "Đóng nắp") {
                if (dailyStats[rDateStr].isOpen) { dailyStats[rDateStr].count++; dailyStats[rDateStr].isOpen = false; }
            }
            else if (actionString === "Bỏ thuốc") dailyStats[rDateStr].missed++;
          }
        }

        var replyText = "📊 THỐNG KÊ UỐNG THUỐC " + titleText + ":\n\n";
        var totalCount = 0; var totalMissed = 0;

        if (text === '/homnay') {
            if (homNayActions > 0) replyText += homNayLogs + "\n";
            else replyText += "Chưa có thao tác nào.\n\n";
            var tdCount = dailyStats[todayStr] ? dailyStats[todayStr].count : 0;
            var tdMissed = dailyStats[todayStr] ? dailyStats[todayStr].missed : 0;
            replyText += "💊 Hôm nay đã uống: " + tdCount + " lần.";
            if (tdMissed > 0) replyText += "\n⚠️ Đã BỎ LỠ: " + tdMissed + " cữ thuốc!";
        } 
        else {
            var sortedDates = Object.keys(dailyStats).sort(function(a, b) {
                var pa = a.split("/"); var pb = b.split("/"); return (pa[2]+pa[1]+pa[0]).localeCompare(pb[2]+pb[1]+pb[0]);
            });
            for (var k = 0; k < sortedDates.length; k++) {
                var c = dailyStats[sortedDates[k]].count; var m = dailyStats[sortedDates[k]].missed;
                if (c > 0 || m > 0) {
                    totalCount += c; totalMissed += m;
                    var displayDate = sortedDates[k].substring(0, 5); 
                    replyText += "🗓️ Ngày " + displayDate + ": Uống " + c + " lần";
                    if (m > 0) replyText += " (Bỏ lỡ " + m + " lần)";
                    replyText += "\n";
                }
            }
            replyText += "\n💊 TỔNG CỘNG ĐÃ UỐNG: " + totalCount + " lần.";
            if (totalMissed > 0) replyText += "\n⚠️ TỔNG CỘNG BỎ LỠ: " + totalMissed + " lần.";
        }

        UrlFetchApp.fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
          "method": "post", "contentType": "application/json", "muteHttpExceptions": true,
          "payload": JSON.stringify({ "chat_id": String(chatId), "text": replyText })
        });
      }
    }
  } catch (err) { }
  return HtmlService.createHtmlOutput("OK");
}

function getLogsByDateRange(startStr, endStr) {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  // Parse ngày bắt đầu và kết thúc (từ định dạng YYYY-MM-DD của thẻ input HTML)
  var sParts = startStr.split("-");
  var eParts = endStr.split("-");
  var startDate = new Date(sParts[0], sParts[1] - 1, sParts[2], 0, 0, 0);
  var endDate = new Date(eParts[0], eParts[1] - 1, eParts[2], 23, 59, 59);

  var result = {};

  // Quét từ dòng thứ 2 (bỏ Header)
  for (var i = 1; i < data.length; i++) {
    var rowDateTime = data[i][0].replace("'", "").trim();
    if (!rowDateTime) continue;

    var parts = rowDateTime.split(" ");
    var dParts = parts[0].split("/"); // [dd, MM, yyyy]
    var tParts = parts[1] ? parts[1].split(":") : ["00", "00"];
    
    // Tạo object Date của dòng hiện tại để so sánh
    var rowDate = new Date(dParts[2], dParts[1] - 1, dParts[0], tParts[0], tParts[1], 0);

    // Nếu nằm trong khoảng thời gian
    if (rowDate >= startDate && rowDate <= endDate) {
      var dateKey = parts[0]; // Ngày định dạng DD/MM/YYYY
      var hm = parts[1].substring(0, 5); // Giờ định dạng HH:mm
      var action = data[i][1];

      if (!result[dateKey]) {
        result[dateKey] = { uong: [], bo: [], isOpen: false };
      }

      if (action === "Mở nắp") {
        result[dateKey].isOpen = true;
      } else if (action === "Đóng nắp") {
        if (result[dateKey].isOpen) {
          if (!result[dateKey].uong.includes(hm)) result[dateKey].uong.push(hm);
          result[dateKey].isOpen = false;
        }
      } else if (action === "Bỏ thuốc") {
        if (!result[dateKey].bo.includes(hm)) result[dateKey].bo.push(hm);
      } else if (action === "Uống trễ") {
        if (!result[dateKey].uong.includes(hm + " (Trễ)")) result[dateKey].uong.push(hm + " (Trễ)");
      }
    }
  }

  return result;
}

// ==========================================
// BÁO CÁO TỔNG KẾT CUỐI NGÀY
// ==========================================

function sendDailySummary() {
  var sheet = SpreadsheetApp.openByUrl(sheetUrl).getSheetByName(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  // Lấy ngày hiện tại theo múi giờ Việt Nam
  var now = new Date();
  var vnTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"})); 
  var todayStr = Utilities.formatDate(vnTime, "GMT+7", "dd/MM/yyyy");
  
  var dailyStats = { count: 0, isOpen: false, times: [], missed: 0, missedTimes: [] };

  // Quét dữ liệu để lọc riêng các tương tác của "Hôm nay"
  for (var i = 1; i < data.length; i++) {
    var timeString = String(data[i][0]).replace("'", "").trim();
    var actionString = String(data[i][1]).trim();
    if (!timeString || timeString === "") continue;

    var parts = timeString.split(" ");
    var rDateStr = parts[0]; 

    // Chỉ xử lý nếu dòng log đó thuộc về ngày hôm nay
    if (rDateStr === todayStr) {
      var hm = parts[1] ? parts[1].substring(0, 5) : "";

      if (actionString === "Mở nắp") {
        dailyStats.isOpen = true;
      } else if (actionString === "Đóng nắp") {
        if (dailyStats.isOpen) { 
          dailyStats.count++; 
          dailyStats.isOpen = false; 
          if (hm && !dailyStats.times.includes(hm)) dailyStats.times.push(hm);
        }
      } else if (actionString === "Bỏ thuốc") {
        dailyStats.missed++;
        if (hm && !dailyStats.missedTimes.includes(hm)) dailyStats.missedTimes.push(hm);
      } else if (actionString === "Uống trễ") {
        if (hm && !dailyStats.times.includes(hm + " (Trễ)")) dailyStats.times.push(hm + " (Trễ)");
      }
    }
  }

  // ---------------------------------------------
  // ĐÓNG GÓI TIN NHẮN THEO FORMAT CHUẨN 
  // ---------------------------------------------
  var message = "📊 <b>BÁO CÁO UỐNG THUỐC CUỐI NGÀY (" + todayStr + ")</b>\n";
  message += "--------------------------------------\n";

  if (dailyStats.count === 0 && dailyStats.missed === 0) {
    message += "➖ <i>Hôm nay không có bất kỳ tương tác nào với hộp thuốc.</i>";
  } else {
    message += "💊 <b>Đã uống thành công:</b> " + dailyStats.count + " lần\n";
    if (dailyStats.times.length > 0) {
      message += "   <i>(Vào lúc: " + dailyStats.times.join(", ") + ")</i>\n";
    }

    if (dailyStats.missed > 0) {
      message += "\n⚠️ <b>SỐ CỮ BỎ LỠ:</b> " + dailyStats.missed + " lần\n";
      if (dailyStats.missedTimes.length > 0) {
        message += "   <i>(Vào lúc: " + dailyStats.missedTimes.join(", ") + ")</i>\n";
      }
    } else {
      message += "\n✅ <i>Tuyệt vời! Hôm nay bệnh nhân tuân thủ rất tốt, không bỏ lỡ cữ thuốc nào.</i>";
    }
  }

  // Gửi qua Telegram (Sử dụng hàm đã có sẵn của bạn)
  sendTelegramNotification(message);
}

// Hàm này để tự động thiết lập Hẹn giờ chạy (Chỉ cần bấm chạy 1 lần duy nhất)
function setupDailyTrigger() {
  // Xóa các hẹn giờ cũ (nếu có) để tránh việc bot gửi 2-3 tin nhắn trùng nhau
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailySummary') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Tạo hẹn giờ mới chạy vào khoảng 20:30 mỗi ngày
  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .everyDays(1)
    .atHour(20)         // Khung giờ 20h (8h tối)
    .nearMinute(30)     // Khoảng phút 30
    .create();

  Logger.log("Đã cài đặt thành công! Bot sẽ tự động gửi báo cáo vào khoảng 8h30 tối mỗi ngày.");
}

// Hàm Dành riêng cho giao diện Web gọi trực tiếp
function checkStatusFromServer() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var settingSheet = sheet.getSheetByName("CaiDat");
  
  // Kiểm tra nếu bạn quên chưa tạo Sheet "CaiDat"
  if (!settingSheet) {
    return "ERROR_NO_SHEET";
  }
  
  var lastPing = settingSheet.getRange("B1").getValue();
  
  // Kiểm tra nếu ô B1 trống (Mạch chưa bật hoặc chưa kịp Ping lần nào)
  if (!lastPing || lastPing === "") {
    return "OFFLINE_NO_DATA";
  }
  
  var now = new Date();
  // Tính khoảng cách thời gian (bằng phút)
  var diffMins = Math.round((now - lastPing) / 60000);
  
  if (diffMins <= 2) {
    return "ONLINE";
  } else {
    return "OFFLINE";
  }
}