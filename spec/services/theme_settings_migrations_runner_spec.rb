# frozen_string_literal: true

describe ThemeSettingsMigrationsRunner do
  fab!(:theme) { Fabricate(:theme) }
  fab!(:migration_field) do
    Fabricate(
      :theme_field,
      type_id: ThemeField.types[:js],
      target_id: Theme.targets[:migrations],
      name: "0001-some-migration",
      theme: theme,
      value: <<~JS,
      export default function migrate(settings) {
        null.toadas();
        return null;
        return settings;
      }
    JS
    ).tap(&:ensure_baked!)
  end
  before { theme.theme_settings.create!(name: "osama", value: "111", data_type: 0) }

  it "asdasd" do
    described_class.new(theme).run
  end
end
