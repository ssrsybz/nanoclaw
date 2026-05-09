class User {
  final String id;
  final String name;
  final String? avatarUrl;
  final String? phoneNumber;

  User({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.phoneNumber,
  });
}
