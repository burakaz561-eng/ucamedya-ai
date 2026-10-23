; UcaMedya AI Growth Studio - kaldırma sırasında kullanıcı verileri
; Güncelleme (yeni sürüm kurulumu) sırasında soru sorulmaz ve veriler her zaman korunur.
; Sessiz kaldırmada (/S) varsayılan cevap "Hayır"dır: veriler korunur.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "UcaMedya AI veritabanı da silinsin mi?$\r$\n$\r$\nŞirket kayıtları, analizler, taslaklar ve ayarlar silinir. (Belgeler klasöründeki raporlar ve ekran görüntüleri silinmez.)$\r$\n$\r$\nHayır derseniz verileriniz korunur; uygulamayı yeniden kurduğunuzda kaldığınız yerden devam edersiniz." /SD IDNO IDNO uca_keep
      RMDir /r "$APPDATA\UcaMedya AI Growth Studio"
    uca_keep:
  ${endIf}
!macroend
