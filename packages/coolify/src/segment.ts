import { err, ok, type Result } from "./result";

const UUID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `uuid` bir Coolify kimliği biçimine uyuyor mu diye doğrular ve uyuyorsa
 * URL'e güvenle gömülebilecek kodlanmış hâlini döner. Uymuyorsa AĞA HİÇ
 * GİTMEDEN hata döner — path/query enjeksiyonunu (ör. `../../v2/servers`,
 * `abc?x=1`) engeller. Kullanıcı denetimli her `uuid` path parçası bu
 * fonksiyondan geçmeden istemciye verilmemelidir.
 */
export function seg(uuid: string): Result<string> {
  if (!UUID_SEGMENT.test(uuid)) {
    return err("not_found", "Geçersiz kaynak tanımlayıcı");
  }
  return ok(encodeURIComponent(uuid));
}
