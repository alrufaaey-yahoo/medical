ALTER TABLE `shifts` ADD CONSTRAINT `shifts_date_type_unique` UNIQUE(`shiftDate`,`shiftType`);

--> statement-breakpoint
INSERT IGNORE INTO `lab_tests` (`code`, `nameAr`, `nameEn`, `category`, `sample`, `price`, `active`) VALUES
  ('CBC', 'صورة الدم الكاملة', 'Complete Blood Count', 'أمراض الدم', 'دم كامل EDTA', 18000, 1),
  ('BFFM', 'صورة الدم للملاريا', 'Blood Film For Malaria', 'أمراض الدم', 'دم', 12000, 1),
  ('UA', 'تحليل البول الكامل', 'Complete Urinalysis', 'التحاليل العامة', 'بول عشوائي', 10000, 1),
  ('GLU', 'سكر الدم العشوائي', 'Random Blood Glucose', 'الكيمياء السريرية', 'مصل / بلازما', 8000, 1),
  ('HbA1c', 'السكر التراكمي', 'Glycated Hemoglobin', 'الكيمياء السريرية', 'دم كامل EDTA', 24000, 1),
  ('LFT', 'وظائف الكبد', 'Liver Function Tests', 'الكيمياء السريرية', 'مصل', 30000, 1),
  ('RFT', 'وظائف الكلى', 'Renal Function Tests', 'الكيمياء السريرية', 'مصل', 28000, 1),
  ('LIPID', 'الدهون الثلاثية والكوليسترول', 'Lipid Profile', 'الكيمياء السريرية', 'مصل صائم', 32000, 1),
  ('TSH', 'الهرمون المحفز للغدة الدرقية', 'Thyroid Stimulating Hormone', 'الهرمونات', 'مصل', 26000, 1),
  ('CRP', 'البروتين المتفاعل C', 'C-Reactive Protein', 'المناعة والالتهاب', 'مصل', 16000, 1),
  ('HBsAg', 'مستضد التهاب الكبد B', 'Hepatitis B Surface Antigen', 'المناعة والفيروسات', 'مصل', 12000, 1);
