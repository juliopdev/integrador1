class DateUtils {
  /**
   * Returns current timestamp in GMT-5 (Peru) format: YYYY-MM-DD HH:mm:ss
   * SQLite sensitive
   */
  static getTimestamp() {
    const now = new Date();
    const peruOffset = -5;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const peruTime = new Date(utc + 3600000 * peruOffset);

    const year = peruTime.getFullYear();
    const month = String(peruTime.getMonth() + 1).padStart(2, "0");
    const day = String(peruTime.getDate()).padStart(2, "0");
    const hours = String(peruTime.getHours()).padStart(2, "0");
    const minutes = String(peruTime.getMinutes()).padStart(2, "0");
    const seconds = String(peruTime.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Also provides an ISO-like string but forced to GMT-5 for JSON fields
   */
  static getISO() {
    return this.getTimestamp().replace(" ", "T") + "-05:00";
  }
}

module.exports = DateUtils;
